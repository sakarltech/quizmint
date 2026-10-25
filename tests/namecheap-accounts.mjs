import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountRepository } from '../db/namecheap-accounts.mjs';

function fixture(execute) {
  const lifecycle = [];
  const connection = {
    execute,
    beginTransaction: async () => lifecycle.push('begin'),
    commit: async () => lifecycle.push('commit'),
    rollback: async () => lifecycle.push('rollback'),
    release: () => lifecycle.push('release'),
  };
  return { lifecycle, repo: accountRepository({ execute, getConnection: async () => connection }) };
}

test('registration keeps values parameterized and handles unique-key races', async () => {
  const user = { id: 'u1', email: "quote'@example.test", passwordHash: 'hash', salt: 'salt', created: '2026-10-25' };
  const f = fixture(async (sql, values) => { assert.ok(!sql.includes(user.email)); assert.deepEqual(values, Object.values(user)); return [{}]; });
  assert.equal(await f.repo.createUser(user), true);
  const duplicate = fixture(async () => { throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }); });
  assert.equal(await duplicate.repo.createUser(user), false);
  const failure = fixture(async () => { throw new Error('connection lost'); });
  await assert.rejects(failure.repo.createUser(user), /connection lost/);
});

test('sessions only return public identity and enforce expiry in SQL', async () => {
  const f = fixture(async (sql, values) => {
    assert.match(sql, /s\.expires>\?/); assert.ok(!sql.includes('password_hash'));
    assert.deepEqual(values, ['token-hash', 1234]); return [[{ id: 'u1', email: 'a@example.test' }]];
  });
  assert.deepEqual(await f.repo.findSession('token-hash', 1234), { id: 'u1', email: 'a@example.test' });
});

test('session issuance locks password state and refuses a changed password', async () => {
  const calls = [];
  const session = { tokenHash: 'token', userId: 'u1', passwordHash: 'hash', salt: 'salt', now: 1000 };
  const f = fixture(async (sql, values) => {
    calls.push(sql);
    if (sql.startsWith('SELECT')) { assert.match(sql, /FOR UPDATE$/); assert.deepEqual(values, ['u1', 'hash', 'salt']); return [[{ id: 'u1' }]]; }
    assert.deepEqual(values, ['token', 'u1', 604801000]); return [{}];
  });
  assert.equal(await f.repo.issueSession(session), true);
  assert.equal(calls.length, 2);
  assert.deepEqual(f.lifecycle, ['begin', 'commit', 'release']);
  const changed = fixture(async sql => { assert.ok(sql.startsWith('SELECT')); return [[]]; });
  assert.equal(await changed.repo.issueSession(session), false);
});

test('rate limit admits under lock, rejects at cap, and resets a previous window', async () => {
  for (const [storedWindow, count, admitted, expected] of [[2, 1, true, 2], [2, 3, false, null], [1, 99, true, 1]]) {
    let updated = false;
    const f = fixture(async (sql, values) => {
      if (sql.startsWith('INSERT')) { assert.match(sql, /ON DUPLICATE KEY/); return [{}]; }
      if (sql.startsWith('SELECT')) { assert.match(sql, /FOR UPDATE$/); return [[{ window: storedWindow, count }]]; }
      updated = true; assert.deepEqual(values, [2, expected, 'hash']); return [{}];
    });
    assert.equal(await f.repo.admit({ keyHash: 'hash', limit: 3, now: 1800000 }), admitted);
    assert.equal(updated, admitted);
    assert.deepEqual(f.lifecycle, ['begin', 'commit', 'release']);
  }
});

test('rate counter failure rolls back and malformed settings do not query', async () => {
  const f = fixture(async sql => { if (sql.startsWith('INSERT')) return [{}]; throw new Error('read failed'); });
  await assert.rejects(f.repo.admit({ keyHash: 'hash', limit: 3 }), /read failed/);
  assert.deepEqual(f.lifecycle, ['begin', 'rollback', 'release']);
  const bad = fixture(async () => assert.fail('must not query'));
  await assert.rejects(bad.repo.admit({ keyHash: 'hash', limit: 0 }), /Invalid/);
  assert.deepEqual(bad.lifecycle, []);
});
