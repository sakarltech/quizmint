import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const migrationId = '0001_initial';
const journal = 'quizmint_schema_migrations';

export async function initialSchema() {
  const sql = await readFile(new URL('../migrations/mariadb/0001_initial.sql', import.meta.url), 'utf8');
  // This checked-in migration contains only CREATE TABLE statements, no routines/strings
  // containing semicolons. Never use this parser for arbitrary imported SQL.
  const statements = sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
  if (!statements.length || statements.some(s => !/^CREATE TABLE `[a-z_]+` \(/.test(s))) {
    throw new Error('Schema migration contains unsupported SQL.');
  }
  return {
    checksum: createHash('sha256').update(sql).digest('hex'), statements,
    tables: statements.map(s => /^CREATE TABLE `([a-z_]+)`/.exec(s)[1]),
  };
}

export async function setupSchema(pool, { apply = false } = {}) {
  const schema = await initialSchema();
  const connection = await pool.getConnection();
  let locked = false;
  try {
    // Per-database advisory lock serializes setup processes; no application data locks.
    const [lock] = await connection.execute("SELECT GET_LOCK(CONCAT('quizmint:', LEFT(SHA2(DATABASE(),256),40)), 10) AS acquired");
    locked = Number(lock[0]?.acquired) === 1;
    if (!locked) throw new Error('Another schema setup is running. Try again later.');
    const [rows] = await connection.execute('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
    const tables = rows.map(row => row.name);
    if (tables.includes(journal)) {
      const [entries] = await connection.execute(`SELECT checksum, status FROM \`${journal}\` WHERE id=?`, [migrationId]);
      const entry = entries[0];
      if (!entry || entry.status !== 'complete') throw new Error('An incomplete setup exists. Stop and inspect it before retrying; no tables were removed.');
      if (entry.checksum !== schema.checksum) throw new Error('Migration checksum differs. Stop and inspect the deployed migration.');
      if (schema.tables.some(table => !tables.includes(table))) throw new Error('An expected table is missing. Stop and inspect the database.');
      return { state: 'already-complete', tables: schema.tables.length };
    }
    if (tables.length) throw new Error('Database is not empty. Setup refused to protect existing data.');
    if (!apply) return { state: 'ready', tables: schema.tables.length };

    // MariaDB DDL commits implicitly. Journal before creating tables, fail closed on
    // partial setup, and never claim this work can be rolled back as a transaction.
    await connection.query(`CREATE TABLE \`${journal}\` (id VARCHAR(64) PRIMARY KEY, checksum CHAR(64) NOT NULL, status VARCHAR(16) NOT NULL, created BIGINT NOT NULL) ENGINE=InnoDB`);
    await connection.execute(`INSERT INTO \`${journal}\` (id,checksum,status,created) VALUES(?,?,'applying',?)`, [migrationId, schema.checksum, Date.now()]);
    for (const statement of schema.statements) await connection.query(statement);
    await connection.execute(`UPDATE \`${journal}\` SET status='complete' WHERE id=?`, [migrationId]);
    return { state: 'created', tables: schema.tables.length };
  } finally {
    if (locked) {
      try { await connection.execute("SELECT RELEASE_LOCK(CONCAT('quizmint:', LEFT(SHA2(DATABASE(),256),40)))"); }
      catch { connection.destroy(); }
    }
    connection.release();
  }
}
