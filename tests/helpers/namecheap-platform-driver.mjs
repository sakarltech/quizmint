import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export function platformDriverFixture() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + file, 'utf8'));
  let waiting = Promise.resolve(), fail = false;
  const execute = async (query, values = []) => {
    if (fail && query.startsWith('UPDATE ai_usage SET status=?')) { fail = false; throw Error('Synthetic settlement failure'); }
    if(query.includes('information_schema.TABLES'))return [[{bytes:0}]];
    const adapted = query.replace(/ FOR UPDATE$/, '').replace(/\bGREATEST\(/g, 'MAX(')
      .replace(/ ON DUPLICATE KEY UPDATE id=VALUES\(id\)$/, ' ON CONFLICT(id) DO NOTHING')
      .replace(/ ON DUPLICATE KEY UPDATE month=VALUES\(month\)$/, ' ON CONFLICT(month) DO NOTHING')
      .replace(/ ON DUPLICATE KEY UPDATE value=VALUES\(value\),updated=VALUES\(updated\)$/, ' ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated=excluded.updated')
      .replace("DATE_FORMAT(TIMESTAMPADD(SECOND,FLOOR(created/1000),'1970-01-01'),'%Y-%m-%d')", "strftime('%Y-%m-%d',created/1000,'unixepoch')");
    const statement = sql.prepare(adapted);
    return query.startsWith('SELECT') ? [statement.all(...values)] : [statement.run(...values)];
  };
  const pool = { execute, getConnection: async () => {
    const previous = waiting; let release; waiting = new Promise(resolve => { release = resolve; }); await previous;
    return { execute, beginTransaction: async () => sql.exec('BEGIN'), commit: async () => sql.exec('COMMIT'), rollback: async () => sql.exec('ROLLBACK'), release: () => release() };
  } };
  return { pool, execute, sql, failNextSettlement: () => { fail = true; }, close: () => sql.close() };
}
