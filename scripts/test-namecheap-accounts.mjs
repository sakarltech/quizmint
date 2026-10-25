// Verify native account queries against the hosting database using connection-local
// temporary tables. Permanent account/session/rate-limit rows are never changed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { namecheapDatabase, closeNamecheapDatabase } from '../db/namecheap.mjs';
import { accountRepository } from '../db/namecheap-accounts.mjs';

let connection;
try {
  connection = await (await namecheapDatabase()).getConnection();
  for (const table of ['creator_users', 'creator_sessions', 'auth_limits']) {
    // MariaDB resolves the LIKE source before creating the same-named temporary
    // table. The temporary table shadows its permanent counterpart on this connection.
    await connection.query(`CREATE TEMPORARY TABLE \`${table}\` LIKE \`${table}\``);
  }
  const store = accountRepository({
    execute: (...args) => connection.execute(...args),
    getConnection: async () => ({
      execute: (...args) => connection.execute(...args),
      beginTransaction: () => connection.beginTransaction(),
      commit: () => connection.commit(),
      rollback: () => connection.rollback(),
      release: () => {}, // Keep the private connection until all checks finish.
    }),
  });
  const id = randomUUID(), now = Date.now(), tokenHash = 'a'.repeat(64);
  const user = { id, email: `${id}@quizmint.invalid`, passwordHash: 'synthetic-hash', salt: 'synthetic-salt', created: new Date(now).toISOString() };
  assert.equal(await store.createUser(user), true);
  assert.equal(await store.createUser({ ...user, id: randomUUID() }), false);
  assert.equal((await store.findByEmail(user.email)).id, id);
  assert.equal(await store.issueSession({ tokenHash, userId: id, passwordHash: user.passwordHash, salt: user.salt, now }), true);
  assert.equal((await store.findSession(tokenHash, now)).id, id);
  assert.equal(await store.findSession(tokenHash, now + 604800000), null);
  assert.equal(await store.issueSession({ tokenHash: 'b'.repeat(64), userId: id, passwordHash: 'changed', salt: user.salt, now }), false);
  for (let n = 0; n < 3; n++) assert.equal(await store.admit({ keyHash: tokenHash, limit: 3, now: 1800000 }), true);
  assert.equal(await store.admit({ keyHash: tokenHash, limit: 3, now: 1800000 }), false);
  assert.equal(await store.admit({ keyHash: tokenHash, limit: 3, now: 2700000 }), true);
  await store.revokeSession(tokenHash);
  assert.equal(await store.findSession(tokenHash, now), null);
  console.log('MariaDB account checks passed: registration, duplicate protection, sessions, expiry, revocation and rate limits. Permanent application data unchanged.');
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : null;
  console.error(code ? `Account checks failed (${code}).` : 'Account checks failed. A database query or assertion did not pass.');
  process.exitCode = 1;
} finally {
  // Destroy rather than returning a connection that shadows real tables to the pool.
  // Disconnect automatically removes all its temporary tables.
  if (connection) connection.destroy();
  await closeNamecheapDatabase();
}
