import { transaction } from './namecheap.mjs';

export function arenaRepository(pool) {
  const rows = async (connection, sql, values = []) => (await connection.execute(sql, values))[0];
  const clock = async connection => Number((await rows(connection, 'SELECT CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED) AS now'))[0].now);
  const lockedRoom = async (connection, code) => (await rows(connection, 'SELECT * FROM arena_rooms WHERE code=? FOR UPDATE', [code]))[0];
  const selected = async (connection, code, playerId, index) => (await rows(connection, 'SELECT selected FROM arena_answers WHERE room_code=? AND player_id=? AND question_index=?', [code, playerId, index]))[0] || null;
  return {
    async list(ownerId) { return rows(pool, 'SELECT code,title,mode,status,created,expires FROM arena_rooms WHERE owner_id=? ORDER BY created DESC LIMIT 50', [ownerId]); },
    async room(code, now) { return (await rows(pool, 'SELECT * FROM arena_rooms WHERE code=? AND expires>?', [code, now]))[0] || null; },
    async participant(code, tokenHash) { return (await rows(pool, 'SELECT id,name FROM arena_players WHERE room_code=? AND token_hash=?', [code, tokenHash]))[0] || null; },
    async create({ code, ownerId, title, quizId, questions, mode, seconds, now, expires }) {
      try {
        await pool.execute("INSERT INTO arena_rooms(code,owner_id,title,quiz_id,questions,mode,seconds,status,question_index,deadline,remaining,version,created,expires) VALUES(?,?,?,?,?,?,?,'lobby',-1,0,0,0,?,?)", [code, ownerId, title, quizId, questions, mode, seconds, now, expires]);
        return true;
      } catch (error) { if (error?.code === 'ER_DUP_ENTRY') return false; throw error; }
    },
    async leaders(code, cutoff) {
      const result = await rows(pool, 'SELECT p.id,p.name,COALESCE(SUM(CASE WHEN a.question_index<=? THEN a.points ELSE 0 END),0) AS score,COALESCE(SUM(CASE WHEN a.question_index<=? AND a.points>0 THEN 1 ELSE 0 END),0) AS correct FROM arena_players p LEFT JOIN arena_answers a ON a.player_id=p.id AND a.room_code=p.room_code WHERE p.room_code=? GROUP BY p.id,p.name,p.joined ORDER BY score DESC,p.joined ASC,p.id ASC', [cutoff, cutoff, code]);
      return result.map(row => ({ ...row, score: Number(row.score), correct: Number(row.correct) }));
    },
    async answerCount(code, index) { return Number((await rows(pool, 'SELECT COUNT(*) n FROM arena_answers WHERE room_code=? AND question_index=?', [code, index]))[0].n); },
    async selected(code, playerId, index) { return selected(pool, code, playerId, index); },
    async join({ code, id, tokenHash, name, limit = 100 }) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error('Invalid Arena capacity.');
      return transaction(pool, async connection => {
        // Always lock the room before players/answers, including deletion and host
        // controls. This makes the cap and the lobby/start boundary atomic.
        const room = await lockedRoom(connection, code), now = await clock(connection);
        if (!room || room.expires <= now || room.status !== 'lobby') return null;
        const [previous] = await rows(connection, 'SELECT id,name FROM arena_players WHERE room_code=? AND token_hash=?', [code, tokenHash]);
        if (previous) return { player: previous, created: false };
        const [count] = await rows(connection, 'SELECT COUNT(*) n FROM arena_players WHERE room_code=?', [code]);
        if (Number(count.n) >= limit) return null;
        try {
          await connection.execute('INSERT INTO arena_players(id,room_code,token_hash,name,name_key,joined) VALUES(?,?,?,?,?,?)', [id, code, tokenHash, name, name.toLowerCase(), now]);
        } catch (error) { if (error?.code === 'ER_DUP_ENTRY') return null; throw error; }
        return { player: { id, name }, created: true };
      });
    },
    async change({ code, ownerId, version, next }) {
      return transaction(pool, async connection => {
        const room = await lockedRoom(connection, code), now = await clock(connection);
        if (!room || room.owner_id !== ownerId || room.version !== version || room.expires <= now) return false;
        // The route calculates transitions from this version's immutable snapshot.
        // Recheck the pause deadline after acquiring the lock to reject late pauses.
        if (next.status === 'paused' && (room.status !== 'question' || room.deadline <= now)) return false;
        const remaining = next.status === 'paused' ? room.deadline - now : next.remaining;
        const deadline = next.status === 'question' ? now + (room.status === 'paused' ? room.remaining : room.seconds * 1000) : next.deadline;
        await connection.execute('UPDATE arena_rooms SET status=?,question_index=?,deadline=?,remaining=?,version=version+1 WHERE code=?', [next.status, next.index, deadline, remaining, code]);
        return true;
      });
    },
    async remove({ code, ownerId, version, playerId }) {
      return transaction(pool, async connection => {
        const room = await lockedRoom(connection, code), now = await clock(connection);
        if (!room || room.owner_id !== ownerId || room.version !== version || room.status !== 'lobby' || room.expires <= now) return false;
        await connection.execute('DELETE FROM arena_players WHERE room_code=? AND id=?', [code, playerId]);
        return true;
      });
    },
    async answer({ code, playerId, index, version, choice }) {
      return transaction(pool, async connection => {
        const room = await lockedRoom(connection, code), now = await clock(connection);
        if (!room || room.expires <= now) return null;
        const [player] = await rows(connection, 'SELECT id FROM arena_players WHERE room_code=? AND id=?', [code, playerId]);
        if (!player) return null;
        const previous = await selected(connection, code, playerId, index);
        if (previous) return previous;
        if (room.status !== 'question' || room.question_index !== index || room.version !== version || room.deadline <= now) return null;
        const question = JSON.parse(room.questions)[index];
        if (!question || !Number.isInteger(choice) || choice < 0 || choice >= question.options.length) return null;
        await connection.execute('INSERT INTO arena_answers(room_code,player_id,question_index,selected,points,created) VALUES(?,?,?,?,?,?)', [code, playerId, index, choice, choice === question.correct ? 1000 : 0, now]);
        return { selected: choice };
      });
    },
    async delete(code, ownerId) {
      return transaction(pool, async connection => {
        const room = await lockedRoom(connection, code);
        if (!room || room.owner_id !== ownerId) return false;
        await connection.execute('DELETE FROM arena_answers WHERE room_code=?', [code]);
        await connection.execute('DELETE FROM arena_players WHERE room_code=?', [code]);
        await connection.execute('DELETE FROM arena_rooms WHERE code=?', [code]);
        return true;
      });
    },
  };
}
