import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quizRepository } from '../db/namecheap-quizzes.mjs';
import { quizTestTables } from '../db/namecheap-quiz-test-tables.mjs';

test('MariaDB decimal aggregates remain JSON numbers', async () => {
  const store = quizRepository({ execute: async () => [[{ average: '12.500', submissions: '2' }, { average: null, submissions: 0 }]] });
  assert.deepEqual(await store.list({ id: 'owner', isAdmin: false }, 0), [{ average: 12.5, submissions: 2 }, { average: null, submissions: 0 }]);
});

test('attempt save locks availability and excludes timed quizzes before writing', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'), commit: async () => calls.push('commit'), rollback: async () => calls.push('rollback'), release: () => calls.push('release'),
    execute: async sql => { assert.match(sql, /active=1 AND time_limit_minutes=0 FOR UPDATE$/); calls.push('availability'); return [[]]; },
  };
  const store = quizRepository({ getConnection: async () => connection });
  assert.equal(await store.saveAttempt({ id: 'attempt', quizId: 'quiz', result: {} }), null);
  assert.deepEqual(calls, ['begin', 'availability', 'commit', 'release']);
});

test('hosting fixture uses distinct temporary names and avoids temporary FULLTEXT indexes', () => {
  const fixture = quizTestTables('abcdef123456');
  assert.equal(fixture.definitions.length, 4);
  assert.ok(fixture.definitions.every(sql => sql.startsWith('CREATE TEMPORARY TABLE `qm_check_')));
  assert.ok(fixture.definitions.some(sql => /AS SELECT \* FROM `public_quizzes` WHERE 1=0$/.test(sql)));
  assert.ok(!fixture.definitions.some(sql => /LIKE `public_quizzes`/.test(sql)));
  const mapped = fixture.sql('SELECT * FROM quizzes q JOIN attempts a ON a.quiz_id=q.id JOIN quiz_sessions s ON s.quiz_id=q.id JOIN public_quizzes p ON p.id=q.id');
  assert.doesNotMatch(mapped, /\b(quizzes|attempts|quiz_sessions|public_quizzes)\b/);
  assert.throws(() => quizTestTables('untrusted-name'), /Invalid/);
});
