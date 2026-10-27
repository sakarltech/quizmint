import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arenaRepository } from '../db/namecheap-arena.mjs';
import { arenaDriverFixture } from './helpers/namecheap-arena-driver.mjs';
import { exerciseArenaStore } from './helpers/namecheap-arena-checks.mjs';

test('Arena ownership, snapshots, reconnects, deadlines, scoring and deletion rollback', async () => {
  const f = arenaDriverFixture();
  try { await exerciseArenaStore({ ...f, store: arenaRepository(f.pool) }); } finally { f.close(); }
});
test('parallel joins respect room capacity and answers are first-write wins', async () => {
  const f = arenaDriverFixture();
  try {
    const store = arenaRepository(f.pool), now = Date.now();
    await store.create({ code: 'ABCDEF', ownerId: 'owner', title: 'Capacity', quizId: 'quiz', questions: JSON.stringify([{ options: ['1', '2', '3', '4'], correct: 1 }]), mode: 'team', seconds: 30, now, expires: now + 60000 });
    const joins = await Promise.all(Array.from({ length: 105 }, (_, i) => store.join({ code: 'ABCDEF', id: 'p-' + i, tokenHash: 'hash-' + i, name: 'Player ' + i })));
    assert.equal(joins.filter(Boolean).length, 100);
    const host = await Promise.all(Array.from({ length: 8 }, () => store.change({ code: 'ABCDEF', ownerId: 'owner', version: 0, next: { status: 'question', index: 0, deadline: now + 60000, remaining: 0 } })));
    assert.equal(host.filter(Boolean).length, 1);
    const answers = await Promise.all(Array.from({ length: 8 }, (_, i) => store.answer({ code: 'ABCDEF', playerId: 'p-0', index: 0, version: 1, choice: i % 4 })));
    assert.ok(answers.every(a => a.selected === answers[0].selected));
    assert.equal(await store.answerCount('ABCDEF', 0), 1);
  } finally { f.close(); }
});
