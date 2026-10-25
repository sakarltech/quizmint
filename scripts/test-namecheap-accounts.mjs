// Verify native account queries against the hosting database using connection-local
// temporary tables. Permanent account/session/rate-limit rows are never changed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { namecheapDatabase, closeNamecheapDatabase } from '../db/namecheap.mjs';
import { accountRepository } from '../db/namecheap-accounts.mjs';
import { accountTestTables } from '../db/namecheap-account-test-tables.mjs';

let connection;
let phase = 'connection';
try {
  connection = await (await namecheapDatabase()).getConnection();
  const tables = accountTestTables(randomUUID().replaceAll('-', '').slice(0, 12));
  phase = 'temporary table creation';
  for (const statement of tables.definitions) await connection.query(statement);
  // Only static repository SQL is mapped; bound values never enter this function.
  const execute = (sql, values) => connection.execute(tables.sql(sql), values);
  const store = accountRepository({
    execute,
    getConnection: async () => ({
      execute,
      beginTransaction: () => connection.beginTransaction(),
      commit: () => connection.commit(),
      rollback: () => connection.rollback(),
      release: () => {}, // Keep the private connection until all checks finish.
    }),
  });
  const id = randomUUID(), now = Date.now(), tokenHash = 'a'.repeat(64);
  const user = { id, email: `${id}@quizmint.invalid`, passwordHash: 'synthetic-hash', salt: 'synthetic-salt', created: new Date(now).toISOString() };
  phase = 'registration';
  assert.equal(await store.createUser(user), true);
  assert.equal(await store.createUser({ ...user, id: randomUUID() }), false);
  assert.equal((await store.findByEmail(user.email)).id, id);
  phase = 'sessions';
  assert.equal(await store.issueSession({ tokenHash, userId: id, passwordHash: user.passwordHash, salt: user.salt, now }), true);
  assert.equal((await store.findSession(tokenHash, now)).id, id);
  assert.equal(await store.findSession(tokenHash, now + 604800000), null);
  assert.equal(await store.issueSession({ tokenHash: 'b'.repeat(64), userId: id, passwordHash: 'changed', salt: user.salt, now }), false);
  phase = 'rate limits';
  for (let n = 0; n < 3; n++) assert.equal(await store.admit({ keyHash: tokenHash, limit: 3, now: 1800000 }), true);
  assert.equal(await store.admit({ keyHash: tokenHash, limit: 3, now: 1800000 }), false);
  assert.equal(await store.admit({ keyHash: tokenHash, limit: 3, now: 2700000 }), true);
  phase = 'session revocation';
  await store.revokeSession(tokenHash);
  assert.equal(await store.findSession(tokenHash, now), null);
  console.log('MariaDB account checks passed: registration, duplicate protection, sessions, expiry, revocation and rate limits. Permanent application data unchanged.');
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : null;
  console.error(code ? `Account checks failed during ${phase} (${code}).` : `Account checks failed during ${phase}. A database query or assertion did not pass.`);
  process.exitCode = 1;
} finally {
  // Destroy rather than returning a connection holding temporary test tables to the pool.
  // Disconnect automatically removes all its temporary tables.
  if (connection) connection.destroy();
  await closeNamecheapDatabase();
}
