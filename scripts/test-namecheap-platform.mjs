import { randomUUID } from 'node:crypto';
import { namecheapDatabase, closeNamecheapDatabase } from '../db/namecheap.mjs';
import { platformRepository } from '../db/namecheap-platform.mjs';
import { exercisePlatformStore } from '../tests/helpers/namecheap-platform-checks.mjs';
let connection, phase = 'connection';
try {
  connection = await (await namecheapDatabase()).getConnection();
  const sources = ['platform_settings', 'ai_budgets', 'ai_usage', 'ai_queue'];
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const names = Object.fromEntries(sources.map(name => [name, `qm_check_${suffix}_${name}`]));
  phase = 'temporary tables';
  for (const source of sources) await connection.query(`CREATE TEMPORARY TABLE \`${names[source]}\` LIKE \`${source}\``);
  const map = sql => sql.replace(/\b(platform_settings|ai_budgets|ai_usage|ai_queue)\b/g, name => names[name]);
  let fail = false;
  const execute = (sql, values) => {
    if (fail && sql.startsWith('UPDATE ai_usage SET status=?')) { fail = false; throw Error('Synthetic settlement failure'); }
    return connection.execute(map(sql), values);
  };
  const pool = { execute, getConnection: async () => ({ execute, beginTransaction: () => connection.beginTransaction(), commit: () => connection.commit(), rollback: () => connection.rollback(), release() {} }) };
  phase = 'budget/queue scenarios';
  await exercisePlatformStore({ store: platformRepository(pool), execute, failNextSettlement: () => { fail = true; } });
  console.log('MariaDB platform checks passed: budget caps, reservations, expiry recovery, settlement, rollback, queue capacity, FIFO and ownership. Permanent settings and spending unchanged. No provider calls or charges.');
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : null;
  console.error(`Platform checks failed during ${phase}${code ? ` (${code})` : ''}.`); process.exitCode = 1;
} finally {
  if (connection) connection.destroy();
  await closeNamecheapDatabase();
}
