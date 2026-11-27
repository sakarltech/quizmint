import { randomUUID } from 'node:crypto';
import { namecheapDatabase, closeNamecheapDatabase } from '../db/namecheap.mjs';
import { arenaRepository } from '../db/namecheap-arena.mjs';
import { exerciseArenaStore } from '../tests/helpers/namecheap-arena-checks.mjs';
let connection, phase = 'connection';
try {
  connection = await (await namecheapDatabase()).getConnection();
  const sources = ['arena_rooms', 'arena_players', 'arena_answers'];
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const names = Object.fromEntries(sources.map(name => [name, `qm_check_${suffix}_${name}`]));
  phase = 'temporary tables';
  for (const source of sources) await connection.query(`CREATE TEMPORARY TABLE \`${names[source]}\` LIKE \`${source}\``);
  const map = sql => sql.replace(/\b(arena_rooms|arena_players|arena_answers)\b/g, name => names[name]);
  let fail = false;
  const execute = (sql, values) => {
    if (fail && sql.startsWith('DELETE FROM arena_players')) { fail = false; throw Error('Synthetic Arena deletion failure'); }
    return connection.execute(map(sql), values);
  };
  const pool = { execute, getConnection: async () => ({ execute, beginTransaction: () => connection.beginTransaction(), commit: () => connection.commit(), rollback: () => connection.rollback(), release() {} }) };
  phase = 'room/player/answer scenarios';
  await exerciseArenaStore({ store: arenaRepository(pool), execute, failNextDelete: () => { fail = true; } });
  console.log('MariaDB Arena checks passed: rooms, ownership, reconnects, player caps, host versions, deadlines, answers, scoring and deletion rollback. Permanent rooms and results unchanged.');
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : null;
  console.error(`Arena checks failed during ${phase}${code ? ` (${code})` : ''}.`); process.exitCode = 1;
} finally {
  if (connection) connection.destroy();
  await closeNamecheapDatabase();
}
