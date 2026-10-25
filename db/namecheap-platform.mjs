import { transaction } from './namecheap.mjs';

const numbers = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;

export function platformRepository(pool) {
  const rows = async (connection, sql, values = []) => (await connection.execute(sql, values))[0];
  // Separate global mutexes serialize short accounting/queue transactions across
  // Node workers. The no-op upsert takes an InnoDB row lock until commit. Never
  // hold either transaction open while talking to an AI provider.
  const lock = (connection, id, now) => connection.execute(
    "INSERT INTO platform_settings(id,value,updated) VALUES(?,'{}',?) ON DUPLICATE KEY UPDATE id=VALUES(id)", [id, now]);
  return {
    async config() {
      const [row] = await rows(pool, "SELECT value FROM platform_settings WHERE id='controls'");
      return row ? JSON.parse(row.value) : {};
    },
    async saveConfig(value, now) {
      await pool.execute("INSERT INTO platform_settings(id,value,updated) VALUES('controls',?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated=VALUES(updated)", [JSON.stringify(value), now]);
    },
    async summary(month) {
      const [row] = await rows(pool, "SELECT COALESCE(SUM(cost_micro),0) cost,COALESCE(SUM(CASE WHEN status='reserved' THEN reserved_micro ELSE 0 END),0) reserved,COUNT(*) calls,COALESCE(SUM(CASE WHEN status IN ('failed','uncertain') THEN 1 ELSE 0 END),0) failures,COALESCE(AVG(CASE WHEN status IN ('completed','failed') THEN duration_ms END),0) latency FROM ai_usage WHERE month=?", [month]);
      return { month, ...numbers(row) };
    },
    async total(month) {
      const [row] = await rows(pool, 'SELECT cost_micro+reserved_micro total FROM ai_budgets WHERE month=?', [month]);
      return Number(row?.total || 0);
    },
    async reserve({ id, month, feature, model, userId, reserve, now, expires, ceiling }) {
      if (![reserve, ceiling, now, expires].every(nonnegative) || reserve === 0 || expires <= now) throw Error('Invalid AI budget reservation.');
      return transaction(pool, async connection => {
        await lock(connection, 'ai-budget-lock', now);
        // Expired calls keep their estimate: a disconnected provider may have
        // completed the work. Recover every affected month in the same commit.
        const expired = await rows(connection, "SELECT month,SUM(reserved_micro) reserved FROM ai_usage WHERE status='reserved' AND expires<=? GROUP BY month", [now]);
        for (const entry of expired) {
          await connection.execute('INSERT INTO ai_budgets(month) VALUES(?) ON DUPLICATE KEY UPDATE month=VALUES(month)', [entry.month]);
          await connection.execute('UPDATE ai_budgets SET cost_micro=cost_micro+?,reserved_micro=GREATEST(0,reserved_micro-?) WHERE month=?', [Number(entry.reserved), Number(entry.reserved), entry.month]);
        }
        await connection.execute("UPDATE ai_usage SET status='uncertain',cost_micro=reserved_micro WHERE status='reserved' AND expires<=?", [now]);
        await connection.execute('INSERT INTO ai_budgets(month) VALUES(?) ON DUPLICATE KEY UPDATE month=VALUES(month)', [month]);
        const [budget] = await rows(connection, 'SELECT cost_micro,reserved_micro FROM ai_budgets WHERE month=? FOR UPDATE', [month]);
        // IDs are one-use. Replayed reservations must not make another call.
        const existing = await rows(connection, 'SELECT id FROM ai_usage WHERE id=?', [id]);
        if (existing.length || Number(budget.cost_micro) + Number(budget.reserved_micro) + reserve > ceiling) return false;
        await connection.execute("INSERT INTO ai_usage(id,month,feature,model,user_id,reserved_micro,status,created,expires) VALUES(?,?,?,?,?,?,'reserved',?,?)", [id, month, feature, model, userId, reserve, now, expires]);
        await connection.execute('UPDATE ai_budgets SET reserved_micro=reserved_micro+? WHERE month=?', [reserve, month]);
        return true;
      });
    },
    async settle({ id, status, cost, input = 0, output = 0, duration }) {
      if (!['completed', 'failed'].includes(status) || ![cost, input, output, duration].every(nonnegative)) throw Error('Invalid AI usage settlement.');
      return transaction(pool, async connection => {
        await lock(connection, 'ai-budget-lock', Date.now());
        const [usage] = await rows(connection, 'SELECT month,reserved_micro,status FROM ai_usage WHERE id=? FOR UPDATE', [id]);
        if (!usage || usage.status !== 'reserved') return false;
        const charged = status === 'failed' ? Number(usage.reserved_micro) : cost;
        await connection.execute('UPDATE ai_budgets SET cost_micro=cost_micro+?,reserved_micro=GREATEST(0,reserved_micro-?) WHERE month=?', [charged, Number(usage.reserved_micro), usage.month]);
        await connection.execute('UPDATE ai_usage SET status=?,cost_micro=?,input_tokens=?,output_tokens=?,duration_ms=? WHERE id=?', [status, charged, input, output, duration, id]);
        return true;
      });
    },
    async ticket({ userId, id, start, now, maxConcurrent }) {
      if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 16) throw Error('Invalid queue capacity.');
      return transaction(pool, async connection => {
        await lock(connection, 'ai-queue-lock', now);
        await connection.execute("UPDATE ai_queue SET status='expired' WHERE status IN ('queued','ready','running') AND expires<=?", [now]);
        let [row] = await rows(connection, 'SELECT * FROM ai_queue WHERE id=?', [id]);
        if (row && row.user_id !== userId) throw Error('Another request is already queued, or the queue is full.');
        if (!row) {
          const [other] = await rows(connection, "SELECT id FROM ai_queue WHERE user_id=? AND status IN ('queued','ready','running') LIMIT 1", [userId]);
          const [count] = await rows(connection, "SELECT COUNT(*) n FROM ai_queue WHERE status='queued'");
          if (other || Number(count.n) >= 1000) throw Error('Another request is already queued, or the queue is full.');
          await connection.execute("INSERT INTO ai_queue(id,user_id,status,created,expires) VALUES(?,?,'queued',?,?)", [id, userId, now, now + 90000]);
          row = { id, user_id: userId, status: 'queued', created: now };
        }
        if (['done', 'expired'].includes(row.status)) throw Error('This queue request has ended. Start a new request.');
        if (row.status === 'queued') {
          await connection.execute("UPDATE ai_queue SET expires=? WHERE id=? AND status='queued'", [now + 90000, id]);
          const [oldest] = await rows(connection, "SELECT id FROM ai_queue WHERE status='queued' ORDER BY created,id LIMIT 1");
          const [active] = await rows(connection, "SELECT COUNT(*) n FROM ai_queue WHERE status IN ('ready','running')");
          if (oldest?.id === id && Number(active.n) < maxConcurrent) {
            await connection.execute("UPDATE ai_queue SET status='ready',expires=? WHERE id=?", [now + 120000, id]);
            row.status = 'ready';
          }
        }
        if (start && row.status === 'ready') {
          await connection.execute("UPDATE ai_queue SET status='running',expires=? WHERE id=?", [now + 480000, id]);
          row.status = 'running';
        }
        const [position] = await rows(connection, "SELECT COUNT(*) n FROM ai_queue WHERE status='queued' AND (created<? OR (created=? AND id<=?))", [row.created, row.created, id]);
        return { status: row.status, position: Number(position.n), ready: row.status === 'ready' || (start && row.status === 'running') };
      });
    },
    async release(userId, id) {
      await transaction(pool, async connection => {
        await lock(connection, 'ai-queue-lock', Date.now());
        await connection.execute("UPDATE ai_queue SET status='done' WHERE id=? AND user_id=?", [id, userId]);
      });
    },
    async dashboard(month, now) {
      const [counts] = await rows(pool, "SELECT (SELECT COUNT(*) FROM creator_users) creators,(SELECT COUNT(*) FROM quizzes) quizzes,(SELECT COUNT(*) FROM attempts) submissions,(SELECT COUNT(*) FROM ai_wallets WHERE subscription_end>?) subscribers,(SELECT COUNT(*) FROM public_quizzes WHERE published=1) publicQuizzes,(SELECT COUNT(*) FROM ai_jobs WHERE status='failed') failedGenerations,(SELECT COUNT(*) FROM ai_queue WHERE status='queued' AND expires>?) queued,(SELECT COUNT(*) FROM ai_queue WHERE status IN ('ready','running') AND expires>?) running", [now, now, now]);
      const features = await rows(pool, 'SELECT feature,COUNT(*) calls,SUM(cost_micro) cost FROM ai_usage WHERE month=? GROUP BY feature', [month]);
      // Arithmetic from the epoch keeps this grouping in UTC regardless of the
      // hosting server's session timezone.
      const daily = await rows(pool, "SELECT DATE_FORMAT(TIMESTAMPADD(SECOND,FLOOR(created/1000),'1970-01-01'),'%Y-%m-%d') day,SUM(cost_micro) cost FROM ai_usage WHERE month=? GROUP BY day ORDER BY day", [month]);
      const errors = await rows(pool, "SELECT feature,model,status,created FROM ai_usage WHERE status IN ('failed','uncertain') ORDER BY created DESC LIMIT 20");
      const [storage] = await rows(pool, 'SELECT COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0) bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
      return { counts: numbers(counts), features: features.map(row => ({ ...row, calls: Number(row.calls), cost: Number(row.cost) })), daily: daily.map(row => ({ ...row, cost: Number(row.cost) })), errors, storageBytes: Number(storage.bytes), storageLimitGB: null, storageAlert: null };
    },
  };
}
