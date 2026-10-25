import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformRepository } from '../db/namecheap-platform.mjs';
import { platformDriverFixture } from './helpers/namecheap-platform-driver.mjs';
import { exercisePlatformStore } from './helpers/namecheap-platform-checks.mjs';

test('AI budgets and FIFO queue preserve accounting, ownership, expiry and rollback', async () => {
  const f = platformDriverFixture();
  try { await exercisePlatformStore({ ...f, store: platformRepository(f.pool) }); } finally { f.close(); }
});
test('parallel calls cannot over-reserve budget or queue capacity', async () => {
  const f = platformDriverFixture();
  try {
    const store = platformRepository(f.pool), now = Date.now();
    const reservations = await Promise.all(Array.from({ length: 10 }, (_, i) => store.reserve({ id: 'r-' + i, month: '2026-10', userId: 'u', feature: 'quiz', model: 'test', reserve: 4000, ceiling: 10000, now, expires: now + 60000 })));
    assert.equal(reservations.filter(Boolean).length, 2);
    const tickets = await Promise.all(Array.from({ length: 10 }, (_, i) => store.ticket({ id: 'q-' + i, userId: 'u-' + i, start: true, now, maxConcurrent: 2 })));
    assert.equal(tickets.filter(t => t.ready).length, 2);
    const sameUser = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => store.ticket({ id: 'same-' + i, userId: 'same-user', start: false, now, maxConcurrent: 2 })));
    assert.equal(sameUser.filter(r => r.status === 'fulfilled').length, 1);
  } finally { f.close(); }
});
