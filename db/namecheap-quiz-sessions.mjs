import { transaction } from './namecheap.mjs';

const clock = 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)';
const openDeadline = `(deadline=0 OR deadline>${clock})`;
async function activeQuiz(connection, quizId) {
  const [rows] = await connection.execute('SELECT id FROM quizzes WHERE id=? AND active=1 FOR UPDATE', [quizId]);
  return rows.length > 0;
}

export function quizSessionRepository(pool) {
  return {
    async find(quizId, tokenHash) {
      const [rows] = await pool.execute('SELECT s.* FROM quiz_sessions s JOIN quizzes q ON q.id=s.quiz_id WHERE s.quiz_id=? AND s.token_hash=? AND q.active=1', [quizId, tokenHash]);
      return rows[0] ?? null;
    },
    async start({ id, quizId, tokenHash, student, snapshot, answers, deadline, now }) {
      return transaction(pool, async connection => {
        if (!await activeQuiz(connection, quizId)) return false;
        await connection.execute('INSERT INTO quiz_sessions(id,quiz_id,token_hash,student,snapshot,answers,deadline,started,updated) VALUES(?,?,?,?,?,?,?,?,?)', [id, quizId, tokenHash, student, snapshot, answers, deadline, now, now]);
        return true;
      });
    },
    async save({ id, quizId, revision, answers, step, now }) {
      return transaction(pool, async connection => {
        // Always lock quiz then session, matching finalization/deletion lock order.
        if (!await activeQuiz(connection, quizId)) return;
        await connection.execute(`UPDATE quiz_sessions SET answers=?,step=?,updated=?,revision=revision+1 WHERE id=? AND quiz_id=? AND revision=? AND result IS NULL AND ${openDeadline}`, [answers, step, now, id, quizId, revision]);
      });
    },
    async finalize({ id, quizId, revision, result, answers, now, expired }) {
      return transaction(pool, async connection => {
        if (!await activeQuiz(connection, quizId)) return;
        await connection.execute(`UPDATE quiz_sessions SET result=?,answers=?,updated=?,revision=revision+1 WHERE id=? AND quiz_id=? AND revision=? AND result IS NULL ${expired ? '' : `AND ${openDeadline}`}`, [result, answers, now, id, quizId, revision]);
        // Read score/answers from the winning stored result, never from a stale
        // competing request. Finalization and attempt insertion commit together.
        await connection.execute("INSERT INTO attempts(id,quiz_id,student,score,total,result,created) SELECT id,quiz_id,student,CAST(JSON_UNQUOTE(JSON_EXTRACT(result,'$.score')) AS UNSIGNED),CAST(JSON_UNQUOTE(JSON_EXTRACT(result,'$.total')) AS UNSIGNED),result,JSON_UNQUOTE(JSON_EXTRACT(result,'$.created')) FROM quiz_sessions WHERE id=? AND quiz_id=? AND result IS NOT NULL ON DUPLICATE KEY UPDATE id=attempts.id", [id, quizId]);
      });
    },
  };
}
