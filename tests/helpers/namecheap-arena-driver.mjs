import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export function arenaDriverFixture() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + file, 'utf8'));
  let waiting = Promise.resolve(), fail = false;
  const execute = async (query, values = []) => {
    if (fail && query.startsWith('DELETE FROM arena_players')) { fail = false; throw Error('Synthetic Arena deletion failure'); }
    if (query === 'SELECT CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED) AS now') return [[{ now: Date.now() }]];
    const adapted = query.replace(/ FOR UPDATE$/, '').replace(/ ON DUPLICATE KEY UPDATE user_id=VALUES\(user_id\)$/, ' ON CONFLICT(user_id) DO NOTHING').replace(/ ON DUPLICATE KEY UPDATE `key`=VALUES\(`key`\)$/, ' ON CONFLICT(key) DO NOTHING');
    try {
      const statement = sql.prepare(adapted);
      return query.startsWith('SELECT') ? [statement.all(...values)] : [statement.run(...values)];
    } catch (error) {
      if (error.message.startsWith('UNIQUE constraint failed:')) error.code = 'ER_DUP_ENTRY';
      throw error;
    }
  };
  const pool = { execute, getConnection: async () => {
    const previous = waiting; let release; waiting = new Promise(resolve => { release = resolve; }); await previous;
    return { execute, beginTransaction: async () => sql.exec('BEGIN'), commit: async () => sql.exec('COMMIT'), rollback: async () => sql.exec('ROLLBACK'), release: () => release() };
  } };
  return { pool, execute, sql, failNextDelete: () => { fail = true; }, close: () => sql.close() };
}
