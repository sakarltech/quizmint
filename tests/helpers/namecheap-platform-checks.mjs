import assert from 'node:assert/strict';
export async function exercisePlatformStore({ store, execute, failNextSettlement }) {
  const now = Date.UTC(2026, 9, 25), month = '2026-10';
  const entry = (id, extra = {}) => ({ id, month, feature: 'quiz', model: 'gpt-4.1-mini', userId: 'creator', reserve: 4000, now, expires: now + 1000, ceiling: 10000, ...extra });
  await store.saveConfig({ monthlyBudgetCents: 1, maxConcurrent: 2, aiPaused: false }, now);
  assert.equal((await store.config()).maxConcurrent, 2);
  assert.equal(await store.reserve(entry('zero', { ceiling: 0 })), false);
  assert.equal(await store.reserve(entry('one')), true);
  assert.equal(await store.reserve(entry('one')), false, 'Reservation replay cannot authorize another provider call');
  assert.equal(await store.reserve(entry('two')), true);
  assert.equal(await store.reserve(entry('over')), false);
  assert.equal(await store.total(month), 8000);
  failNextSettlement();
  await assert.rejects(store.settle({ id: 'one', status: 'completed', cost: 200, input: 100, output: 100, duration: 12 }));
  assert.equal(await store.total(month), 8000, 'Failed settlement rolls budget changes back');
  assert.equal((await store.summary(month)).reserved, 8000);
  assert.equal(await store.settle({ id: 'one', status: 'completed', cost: 200, input: 100, output: 100, duration: 12 }), true);
  assert.equal(await store.settle({ id: 'one', status: 'failed', cost: 9000, duration: 15 }), false);
  assert.equal(await store.settle({ id: 'two', status: 'failed', cost: 1, duration: 20 }), true);
  assert.equal(await store.total(month), 4200, 'Unknown failures retain reserved estimate');
  assert.equal(await store.reserve(entry('old', { month: '2026-09' })), true);
  assert.equal(await store.reserve(entry('expire')), true);
  // Recovery commits even when the new request is denied; old months stay separate.
  assert.equal(await store.reserve(entry('denied-after-expiry', { now: now + 1000, expires: now + 2000, ceiling: 0 })), false);
  assert.equal(await store.total('2026-09'), 4000);
  const summary = await store.summary(month);
  assert.equal(summary.reserved, 0);
  assert.equal(summary.cost, 8200);
  assert.equal(summary.failures, 2);
  assert.equal(summary.calls, 3);
  assert.equal(await store.settle({ id: 'expire', status: 'completed', cost: 500, duration: 1001 }), false, 'Late completion does not double charge recovered calls');
  const [[ledger]] = await execute('SELECT SUM(cost_micro) cost FROM ai_usage');
  const [[budget]] = await execute('SELECT SUM(cost_micro) cost,SUM(reserved_micro) reserved FROM ai_budgets');
  assert.equal(Number(ledger.cost), Number(budget.cost));
  assert.equal(Number(budget.reserved), 0);
  await assert.rejects(store.reserve(entry('negative', { reserve: -1 })), /Invalid/);

  const ticket = (id, extra = {}) => ({ userId: 'user-' + id, id, start: false, now, maxConcurrent: 2, ...extra });
  assert.equal((await store.ticket(ticket('a'))).ready, true);
  assert.equal((await store.ticket(ticket('b'))).ready, true);
  assert.equal((await store.ticket(ticket('c'))).position, 1);
  assert.equal((await store.ticket(ticket('d'))).position, 2);
  await assert.rejects(store.ticket(ticket('a', { userId: 'intruder' })), /Another/);
  await assert.rejects(store.ticket(ticket('e', { userId: 'user-a' })), /Another/);
  await store.release('intruder', 'a');
  assert.equal((await store.ticket(ticket('c'))).ready, false, 'Other users cannot release capacity');
  assert.equal((await store.ticket(ticket('a', { start: true }))).status, 'running');
  await store.release('user-a', 'a');
  assert.equal((await store.ticket(ticket('d'))).ready, false, 'Newer poll cannot jump the oldest waiting ticket');
  assert.equal((await store.ticket(ticket('c', { start: true }))).status, 'running');
  await assert.rejects(store.ticket(ticket('a')), /ended/);
  // Ready slots expire at two minutes; running requests keep their longer lease.
  assert.equal((await store.ticket(ticket('f', { now: now + 120001 }))).ready, true);
  await assert.rejects(store.ticket(ticket('b', { now: now + 120001 })), /ended/);
  // Repeated polls do not extend a running lease indefinitely.
  assert.equal((await store.ticket(ticket('c', { start: true, now: now + 200000 }))).status, 'running');
  assert.equal((await store.ticket(ticket('g', { now: now + 480001 }))).ready, true);
  await assert.rejects(store.ticket(ticket('c', { now: now + 480001 })), /ended/);
  await assert.rejects(store.ticket(ticket('invalid', { maxConcurrent: 0 })), /Invalid/);
  await execute('DELETE FROM ai_queue');
  const waiting = Array.from({ length: 1000 }, (_, i) => ['full-' + String(i).padStart(4, '0'), 'full-user-' + i, 'queued', now, now + 90000]);
  await execute('INSERT INTO ai_queue(id,user_id,status,created,expires) VALUES ' + waiting.map(() => '(?,?,?,?,?)').join(','), waiting.flat());
  await assert.rejects(store.ticket(ticket('overflow')), /full/);
  assert.equal((await store.ticket({ userId: 'full-user-0', id: 'full-0000', start: false, now, maxConcurrent: 1 })).ready, true, 'Existing tickets can leave a full waiting queue');
  assert.equal((await store.ticket(ticket('space', { maxConcurrent: 1 }))).status, 'queued');
}
