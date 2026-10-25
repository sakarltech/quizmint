import { env } from 'cloudflare:workers';
import { db } from './server';
interface AiStore {
  wallet(userId: string, periodStart: number, freeLimit?: number): Promise<any>;
  job(id: string, userId: string): Promise<any>;
  latest(userId: string): Promise<{ result: string } | null>;
  reserve(input: {userId: string; jobId: string; free: number; paid: number; periodStart: number; now: number}): Promise<boolean>;
  refund(input: {userId: string; jobId: string; expiredOnly: boolean; periodStart: number; now: number}): Promise<void>;
  complete(input: {userId: string; jobId: string; result: string}): Promise<boolean>;
  fulfilPayment(input: {userId: string; sessionId: string; questions: number; customer: string | null; periodStart: number; now: number}): Promise<boolean>;
  extendSubscription(userId: string, end: number, customer: string): Promise<void>;
  cancelSubscription(userId: string, customer: string): Promise<void>;
}
const workerStore: AiStore = {
  async wallet(userId, start, limit = 20) {
    await db().prepare('INSERT INTO ai_wallets(user_id,free_period_start) VALUES(?,?) ON CONFLICT DO NOTHING').bind(userId, start).run();
    await db().prepare('UPDATE ai_wallets SET free_remaining=CASE WHEN free_period_start>0 AND free_period_start<? THEN ? ELSE MIN(?,MAX(0,free_remaining)) END,free_period_start=MAX(free_period_start,?) WHERE user_id=? AND (free_period_start<? OR free_remaining>? OR free_remaining<0)').bind(start, limit, limit, start, userId, start, limit).run();
    return db().prepare('SELECT * FROM ai_wallets WHERE user_id=?').bind(userId).first();
  },
  job(id, userId) { return db().prepare('SELECT * FROM ai_jobs WHERE id=? AND user_id=?').bind(id, userId).first(); },
  latest(userId) { return db().prepare("SELECT result FROM ai_jobs WHERE user_id=? AND status='completed' ORDER BY created DESC LIMIT 1").bind(userId).first(); },
  async reserve({userId, jobId, free, paid, periodStart, now}) {
    await db().batch([db().prepare('UPDATE ai_wallets SET free_remaining=free_remaining-?,credits=credits-?,lock_id=?,locked_until=? WHERE user_id=? AND locked_until<=? AND free_remaining>=? AND credits>=? AND free_period_start=?').bind(free, paid, jobId, now + 360000, userId, now, free, paid, periodStart), db().prepare("INSERT INTO ai_jobs(id,user_id,free,paid,status,created) SELECT ?,?,?,?,'running',? WHERE EXISTS(SELECT 1 FROM ai_wallets WHERE user_id=? AND lock_id=?)").bind(jobId, userId, free, paid, now, userId, jobId)]);
    const row = await db().prepare('SELECT lock_id FROM ai_wallets WHERE user_id=?').bind(userId).first<{lock_id: string | null}>();
    return row?.lock_id === jobId;
  },
  async refund({userId, jobId, expiredOnly, now}) {
    await db().batch([
      db().prepare("UPDATE ai_wallets SET free_remaining=MIN(20,free_remaining+COALESCE((SELECT free FROM ai_jobs WHERE id=? AND user_id=? AND status='running' AND created>=free_period_start),0)),credits=credits+COALESCE((SELECT paid FROM ai_jobs WHERE id=? AND user_id=? AND status='running'),0),lock_id=NULL,locked_until=0 WHERE user_id=? AND lock_id=? AND (?=0 OR locked_until<=?)").bind(jobId, userId, jobId, userId, userId, jobId, expiredOnly ? 1 : 0, now),
      db().prepare("UPDATE ai_jobs SET status='failed' WHERE id=? AND user_id=? AND status='running' AND NOT EXISTS(SELECT 1 FROM ai_wallets WHERE user_id=? AND lock_id=?)").bind(jobId, userId, userId, jobId),
    ]);
  },
  async complete({userId, jobId, result}) {
    await db().batch([db().prepare("UPDATE ai_jobs SET status='completed',result=? WHERE id=? AND user_id=? AND status='running'").bind(result, jobId, userId), db().prepare('UPDATE ai_wallets SET lock_id=NULL,locked_until=0 WHERE user_id=? AND lock_id=?').bind(userId, jobId)]);
    const job = await db().prepare('SELECT status FROM ai_jobs WHERE id=? AND user_id=?').bind(jobId, userId).first<{status: string}>();
    return job?.status === 'completed';
  },
  async fulfilPayment({userId, sessionId, questions, customer, now}) {
    await db().batch([db().prepare('UPDATE ai_wallets SET credits=credits+?,customer=COALESCE(?,customer) WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM ai_payments WHERE id=?)').bind(questions, customer, userId, sessionId), db().prepare('INSERT INTO ai_payments(id,user_id,created) VALUES(?,?,?) ON CONFLICT DO NOTHING').bind(sessionId, userId, now)]);
    return true;
  },
  async extendSubscription(userId, end, customer) { await db().prepare('UPDATE ai_wallets SET subscription_end=MAX(subscription_end,?),customer=? WHERE user_id=?').bind(end, customer, userId).run(); },
  async cancelSubscription(userId, customer) { await db().prepare('UPDATE ai_wallets SET subscription_end=0 WHERE user_id=? AND customer=?').bind(userId, customer).run(); },
};
let mariaStore: Promise<AiStore> | undefined;
export function aiStore(): Promise<AiStore> {
  if ((env as any).QUIZMINT_RUNTIME !== 'namecheap') return Promise.resolve(workerStore);
  if (!mariaStore) mariaStore = Promise.all([import('../db/namecheap.mjs'), import('../db/namecheap-ai.mjs')])
    .then(async ([database, ai]) => ai.aiRepository(await database.namecheapDatabase()) as AiStore)
    .catch(error => { mariaStore = undefined; throw error; });
  return mariaStore;
}
