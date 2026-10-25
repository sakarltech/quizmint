import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseOptions, transaction } from '../db/namecheap.mjs';
const env = { DB_NAME: 'test_db', DB_USER: 'test_user', DB_PASSWORD: 'private-test-password' };

test('requires credentials and bounds pool size/port without opening a connection', () => {
  for (const key of Object.keys(env)) assert.throws(() => databaseOptions({ ...env, [key]: '' }), new RegExp(key));
  for (const DB_PORT of ['bad', '0', '65536']) assert.throws(() => databaseOptions({ ...env, DB_PORT }), /DB_PORT/);
  for (const DB_CONNECTION_LIMIT of ['0', '21', 'bad']) assert.throws(() => databaseOptions({ ...env, DB_CONNECTION_LIMIT }), /DB_CONNECTION_LIMIT/);
  const options = databaseOptions(env);
  assert.equal(options.host, 'localhost');
  assert.equal(options.connectionLimit, 5);
  assert.equal(options.multipleStatements, false);
  assert.equal(options.charset, 'utf8mb4');
  assert.equal(options.password, env.DB_PASSWORD);
});

function fixture({ commitError, rollbackError } = {}) {
  const calls = [];
  const connection = {
    beginTransaction: async () => { calls.push('begin'); },
    commit: async () => { calls.push('commit'); if (commitError) throw commitError; },
    rollback: async () => { calls.push('rollback'); if (rollbackError) throw rollbackError; },
    release: () => { calls.push('release'); },
  };
  return { calls, connection, pool: { getConnection: async () => connection } };
}

test('transaction uses one connection and commits once before release', async () => {
  const f = fixture();
  const value = await transaction(f.pool, async connection => { assert.equal(connection, f.connection); f.calls.push('query'); return 42; });
  assert.equal(value, 42);
  assert.deepEqual(f.calls, ['begin', 'query', 'commit', 'release']);
});

test('failed operation rolls back and releases without retry or commit', async () => {
  const f = fixture({ rollbackError: new Error('rollback failed') });
  const error = new Error('operation failed');
  await assert.rejects(transaction(f.pool, async () => { throw error; }), e => e === error);
  assert.deepEqual(f.calls, ['begin', 'rollback', 'release']);
});

test('commit failure is propagated without retrying the operation', async () => {
  const error = new Error('connection lost on commit');
  const f = fixture({ commitError: error });
  let calls = 0;
  await assert.rejects(transaction(f.pool, async () => { calls++; }), e => e === error);
  assert.equal(calls, 1);
  assert.deepEqual(f.calls, ['begin', 'commit', 'rollback', 'release']);
});
