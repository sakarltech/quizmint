import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { initialSchema, setupSchema } from '../db/namecheap-schema.mjs';

function fake({ tables = [], entry, failAt = -1, lock = 1 } = {}) {
  const writes = [], calls = [];
  const connection = {
    execute: async (sql, values) => {
      calls.push(sql);
      if (sql.includes('GET_LOCK')) return [[{ acquired: lock }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.includes('information_schema')) return [tables.map(name => ({ name }))];
      if (sql.startsWith('SELECT checksum')) return [[...(entry ? [entry] : [])]];
      writes.push(sql); return [{}];
    },
    query: async sql => { writes.push(sql); if (writes.length === failAt) throw new Error('DDL failed'); return [{}]; },
    release: () => calls.push('release'), destroy: () => calls.push('destroy'),
  };
  return { pool: { getConnection: async () => connection }, writes, calls };
}

test('schema preserves every D1 application column, key, index and foreign key', async () => {
  const source = new DatabaseSync(':memory:');
  try {
    for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) source.exec(readFileSync('drizzle/' + file, 'utf8'));
    const schema = await initialSchema();
    const sourceTables = source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'public_quiz_search%' ORDER BY name").all().map(row => row.name);
    assert.deepEqual([...schema.tables].sort(), sourceTables);
    for (let n = 0; n < schema.tables.length; n++) {
      const name = schema.tables[n], statement = schema.statements[n];
      const columns = source.prepare(`PRAGMA table_info(${name})`).all();
      for (const col of columns) {
        const match = new RegExp('^  `' + col.name + '` ([A-Z]+(?:\\(\\d+\\))?) (NOT NULL|NULL)(?: DEFAULT ([^,]+))?,?$', 'm').exec(statement);
        assert.ok(match, `${name}.${col.name}`);
        assert.equal(match[2], col.notnull || col.pk ? 'NOT NULL' : 'NULL');
        if (col.type === 'integer') assert.equal(match[1], 'BIGINT');
        assert.equal(match[3] ?? null, col.dflt_value);
      }
      for (const index of source.prepare(`PRAGMA index_list(${name})`).all()) {
        const cols = source.prepare(`PRAGMA index_info(${index.name})`).all().map(col => '`' + col.name + '`').join(', ');
        assert.ok(statement.includes((index.origin === 'pk' ? 'PRIMARY KEY (' : index.unique ? 'UNIQUE KEY ' : 'KEY ')));
        assert.ok(statement.includes('(' + cols + ')'), `${name} key ${cols}`);
      }
      for (const fk of source.prepare(`PRAGMA foreign_key_list(${name})`).all()) {
        assert.ok(schema.tables.indexOf(fk.table) < n, 'parent must be created first');
        assert.ok(statement.includes(`FOREIGN KEY (\`${fk.from}\`) REFERENCES \`${fk.table}\` (\`${fk.to}\`)`));
      }
      assert.ok(statement.includes('ENGINE=InnoDB'));
      assert.ok(statement.includes('COLLATE=utf8mb4_bin'));
    }
    assert.ok(schema.statements.find(s => s.startsWith('CREATE TABLE `public_quizzes`')).includes('FULLTEXT KEY'));
  } finally { source.close(); }
});

test('preview makes no schema/data writes and refuses a nonempty database', async () => {
  const f = fake();
  assert.equal((await setupSchema(f.pool)).state, 'ready');
  assert.equal(f.writes.length, 0);
  const occupied = fake({ tables: ['existing_table'] });
  await assert.rejects(setupSchema(occupied.pool, { apply: true }), /not empty/);
  assert.equal(occupied.writes.length, 0);
  assert.equal(occupied.calls.at(-1), 'release');
});

test('apply journals before DDL and marks complete only after all tables', async () => {
  const f = fake(), schema = await initialSchema();
  assert.equal((await setupSchema(f.pool, { apply: true })).state, 'created');
  assert.match(f.writes[0], /CREATE TABLE `quizmint_schema_migrations`/);
  assert.match(f.writes[1], /'applying'/);
  assert.equal(f.writes.filter(s => /^CREATE TABLE/.test(s)).length, schema.tables.length + 1);
  assert.match(f.writes.at(-1), /SET status='complete'/);
});

test('partial failures never mark complete or drop tables', async () => {
  const f = fake({ failAt: 4 });
  await assert.rejects(setupSchema(f.pool, { apply: true }), /DDL failed/);
  assert.ok(f.writes.every(s => !/DROP |TRUNCATE |status='complete'/.test(s)));
  assert.equal(f.calls.at(-1), 'release');
  const partial = fake({ tables: ['quizmint_schema_migrations'], entry: { status: 'applying' } });
  await assert.rejects(setupSchema(partial.pool, { apply: true }), /incomplete/);
  assert.equal(partial.writes.length, 0);
});

test('completed migration is a no-op, but checksum/missing-table mismatch fails closed', async () => {
  const schema = await initialSchema();
  const tables = ['quizmint_schema_migrations', ...schema.tables];
  const entry = { status: 'complete', checksum: schema.checksum };
  const f = fake({ tables, entry });
  assert.equal((await setupSchema(f.pool, { apply: true })).state, 'already-complete');
  assert.equal(f.writes.length, 0);
  await assert.rejects(setupSchema(fake({ tables, entry: { ...entry, checksum: 'wrong' } }).pool), /checksum/);
  await assert.rejects(setupSchema(fake({ tables: tables.slice(0, -1), entry }).pool), /missing/);
});

test('unavailable lock prevents all writes', async () => {
  const f = fake({ lock: 0 });
  await assert.rejects(setupSchema(f.pool, { apply: true }), /Another/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.calls.at(-1), 'release');
});
