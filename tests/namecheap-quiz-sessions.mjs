import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quizSessionRepository } from '../db/namecheap-quiz-sessions.mjs';

function fixture({ active = true, failAttempt = false } = {}) {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'), commit: async () => calls.push('commit'), rollback: async () => calls.push('rollback'), release: () => calls.push('release'),
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT id FROM quizzes')) return [active ? [{ id: 'q' }] : []];
      if (failAttempt && sql.startsWith('INSERT INTO attempts')) throw Error('attempt insert failed');
      return [{}];
    },
  };
  return { calls, store: quizSessionRepository({ getConnection: async () => connection }) };
}
const finish = { id: 's', quizId: 'q', revision: 3, result: '{"score":1}', answers: '[3]', now: 1000, expired: false };

test('manual finalization uses the database clock, revision and a quiz-first lock', async () => {
  const f = fixture();
  await f.store.finalize(finish);
  const queries = f.calls.filter(c => typeof c === 'object');
  assert.match(queries[0].sql, /SELECT id FROM quizzes.*FOR UPDATE$/);
  assert.match(queries[1].sql, /quiz_id=\? AND revision=\? AND result IS NULL/);
  assert.match(queries[1].sql, /CURRENT_TIMESTAMP\(3\)/);
  assert.deepEqual(queries[1].values, [finish.result, finish.answers, 1000, 's', 'q', 3]);
  assert.match(queries[2].sql, /SELECT id,quiz_id,student,CAST\(JSON_UNQUOTE/);
  assert.match(queries[2].sql, /WHERE id=\? AND quiz_id=\? AND result IS NOT NULL/);
  assert.match(queries[2].sql, /ON DUPLICATE KEY UPDATE id=attempts.id$/);
  assert.equal(f.calls.at(-2), 'commit');
});

test('expired finalization can persist saved answers after deadline; closed quizzes cannot write', async () => {
  const expired = fixture();
  await expired.store.finalize({ ...finish, expired: true });
  assert.ok(expired.calls.some(c => typeof c === 'object' && c.sql.startsWith('UPDATE') && !c.sql.includes('CURRENT_TIMESTAMP')));
  const closed = fixture({ active: false });
  await closed.store.finalize(finish);
  assert.equal(closed.calls.filter(c => typeof c === 'object').length, 1);
});

test('attempt failure rolls back session finalization rather than committing half a result', async () => {
  const f = fixture({ failAttempt: true });
  await assert.rejects(f.store.finalize(finish), /attempt insert failed/);
  assert.ok(f.calls.includes('rollback'));
  assert.ok(!f.calls.includes('commit'));
  assert.equal(f.calls.at(-1), 'release');
});

test('autosaves follow the same lock order and enforce database deadline and revision', async () => {
  const f = fixture();
  await f.store.save({ id: 's', quizId: 'q', revision: 0, answers: '[3]', step: 0, now: 1000 });
  const queries = f.calls.filter(c => typeof c === 'object');
  assert.match(queries[0].sql, /FOR UPDATE$/);
  assert.match(queries[1].sql, /revision=\? AND result IS NULL AND .*CURRENT_TIMESTAMP/);
});
