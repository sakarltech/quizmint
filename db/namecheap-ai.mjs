import { transaction } from './namecheap.mjs';

async function lockedWallet(connection, userId, periodStart, freeLimit) {
  await connection.execute('INSERT INTO ai_wallets(user_id,free_period_start) VALUES(?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)', [userId, periodStart]);
  await connection.execute('UPDATE ai_wallets SET free_remaining=CASE WHEN free_period_start>0 AND free_period_start<? THEN ? ELSE LEAST(?,GREATEST(0,free_remaining)) END,free_period_start=GREATEST(free_period_start,?) WHERE user_id=? AND (free_period_start<? OR free_remaining>? OR free_remaining<0)', [periodStart, freeLimit, freeLimit, periodStart, userId, periodStart, freeLimit]);
  const [rows] = await connection.execute('SELECT * FROM ai_wallets WHERE user_id=? FOR UPDATE', [userId]);
  if (!rows[0]) throw new Error('Wallet unavailable.');
  return rows[0];
}

export function aiRepository(pool) {
  return {
    wallet(userId, periodStart, freeLimit = 20) {
      return transaction(pool, connection => lockedWallet(connection, userId, periodStart, freeLimit));
    },
    async job(id, userId) {
      const [rows] = await pool.execute('SELECT * FROM ai_jobs WHERE id=? AND user_id=?', [id, userId]);
      return rows[0] ?? null;
    },
    async latest(userId) {
      const [rows] = await pool.execute("SELECT result FROM ai_jobs WHERE user_id=? AND status='completed' ORDER BY created DESC,id DESC LIMIT 1", [userId]);
      return rows[0] ?? null;
    },
    async reserve({ userId, jobId, free, paid, periodStart, now }) {
      if (![free, paid].every(n => Number.isSafeInteger(n) && n >= 0) || free > 20 || free + paid > 50) throw new Error('Invalid credit reservation.');
      return transaction(pool, async connection => {
        const wallet = await lockedWallet(connection, userId, periodStart, 20);
        if (wallet.lock_id || wallet.locked_until > now || wallet.free_remaining < free || wallet.credits < paid || wallet.free_period_start !== periodStart) return false;
        const [jobs] = await connection.execute('SELECT id FROM ai_jobs WHERE id=? FOR UPDATE', [jobId]);
        if (jobs.length) return false;
        await connection.execute('UPDATE ai_wallets SET free_remaining=free_remaining-?,credits=credits-?,lock_id=?,locked_until=? WHERE user_id=?', [free, paid, jobId, now + 360000, userId]);
        await connection.execute("INSERT INTO ai_jobs(id,user_id,free,paid,status,created) VALUES(?,?,?,?,'running',?)", [jobId, userId, free, paid, now]);
        return true;
      });
    },
    async refund({ userId, jobId, expiredOnly, periodStart, now }) {
      return transaction(pool, async connection => {
        const wallet = await lockedWallet(connection, userId, periodStart, 20);
        const [jobs] = await connection.execute('SELECT * FROM ai_jobs WHERE id=? AND user_id=? FOR UPDATE', [jobId, userId]);
        const job = jobs[0];
        if (wallet.lock_id === jobId) {
          if (expiredOnly && wallet.locked_until > now) return;
          const free = job?.status === 'running' && job.created >= wallet.free_period_start ? job.free : 0;
          const paid = job?.status === 'running' ? job.paid : 0;
          await connection.execute('UPDATE ai_wallets SET free_remaining=LEAST(20,free_remaining+?),credits=credits+?,lock_id=NULL,locked_until=0 WHERE user_id=?', [free, paid, userId]);
        }
        if (job?.status === 'running') await connection.execute("UPDATE ai_jobs SET status='failed' WHERE id=? AND user_id=?", [jobId, userId]);
      });
    },
    async complete({ userId, jobId, result }) {
      return transaction(pool, async connection => {
        const [wallets] = await connection.execute('SELECT lock_id FROM ai_wallets WHERE user_id=? FOR UPDATE', [userId]);
        const [jobs] = await connection.execute('SELECT status FROM ai_jobs WHERE id=? AND user_id=? FOR UPDATE', [jobId, userId]);
        if (wallets[0]?.lock_id !== jobId || jobs[0]?.status !== 'running') return false;
        await connection.execute("UPDATE ai_jobs SET status='completed',result=? WHERE id=? AND user_id=?", [result, jobId, userId]);
        await connection.execute('UPDATE ai_wallets SET lock_id=NULL,locked_until=0 WHERE user_id=? AND lock_id=?', [userId, jobId]);
        return true;
      });
    },
    async fulfilPayment({ userId, sessionId, questions, customer, periodStart, now }) {
      if (!Number.isSafeInteger(questions) || questions < 1) throw new Error('Invalid purchased credit amount.');
      return transaction(pool, async connection => {
        await lockedWallet(connection, userId, periodStart, 20);
        const [payments] = await connection.execute('SELECT user_id FROM ai_payments WHERE id=? FOR UPDATE', [sessionId]);
        if (payments.length) {
          if (payments[0].user_id !== userId) throw new Error('Payment ownership mismatch.');
          return false;
        }
        await connection.execute('INSERT INTO ai_payments(id,user_id,created) VALUES(?,?,?)', [sessionId, userId, now]);
        await connection.execute('UPDATE ai_wallets SET credits=credits+?,customer=COALESCE(?,customer) WHERE user_id=?', [questions, customer ?? null, userId]);
        return true;
      });
    },
    async extendSubscription(userId, end, customer) {
      await pool.execute('UPDATE ai_wallets SET subscription_end=GREATEST(subscription_end,?),customer=? WHERE user_id=?', [end, customer, userId]);
    },
    async cancelSubscription(userId, customer) {
      await pool.execute('UPDATE ai_wallets SET subscription_end=0 WHERE user_id=? AND customer=?', [userId, customer]);
    },
  };
}
