import { transaction } from './namecheap.mjs';

export function quizRepository(pool) {
  return {
    async get(id) {
      const [rows] = await pool.execute('SELECT * FROM quizzes WHERE id=?', [id]);
      return rows[0] ?? null;
    },
    async owns(id, owner) {
      const [rows] = await pool.execute('SELECT id FROM quizzes WHERE id=? AND (?=1 OR owner_id=?)', [id, owner.isAdmin ? 1 : 0, owner.id]);
      return rows.length > 0;
    },
    async list(owner, offset) {
      const filter = owner.isAdmin ? '1' : 'q.owner_id=?';
      const bindings = owner.isAdmin ? [] : [owner.id];
      const [rows] = await pool.execute(`WITH page AS (SELECT q.* FROM quizzes q WHERE ${filter} ORDER BY q.created DESC,q.id DESC LIMIT 26 OFFSET ?) SELECT q.*,(SELECT COUNT(*) FROM attempts a WHERE a.quiz_id=q.id) submissions,(SELECT AVG(100.0*a.score/a.total) FROM attempts a WHERE a.quiz_id=q.id) average,COALESCE((SELECT published FROM public_quizzes p WHERE p.id=q.id),0) libraryPublished FROM page q ORDER BY q.created DESC,q.id DESC`, [...bindings, offset]);
      // MySQL DECIMAL aggregate values may arrive as strings; preserve API numbers.
      return rows.map(row => ({ ...row, submissions: Number(row.submissions), average: row.average === null ? null : Number(row.average) }));
    },
    async attempts(id, offset) {
      const [rows] = await pool.execute('SELECT id,student,score,total,created FROM attempts WHERE quiz_id=? ORDER BY created DESC,id DESC LIMIT 101 OFFSET ?', [id, offset]);
      return rows;
    },
    async create({ id, quiz, ownerId, created }) {
      await pool.execute('INSERT INTO quizzes(id,title,subject,description,questions,created,owner_id,time_limit_minutes) VALUES(?,?,?,?,?,?,?,?)', [id, quiz.title, quiz.subject, quiz.description, JSON.stringify(quiz.questions), created, ownerId, quiz.timeLimitMinutes]);
    },
    async setActive(id, active, owner) {
      await pool.execute('UPDATE quizzes SET active=? WHERE id=? AND (?=1 OR owner_id=?)', [active ? 1 : 0, id, owner.isAdmin ? 1 : 0, owner.id]);
    },
    async remove(id, owner) {
      return transaction(pool, async connection => {
        const [rows] = await connection.execute('SELECT id FROM quizzes WHERE id=? AND (?=1 OR owner_id=?) FOR UPDATE', [id, owner.isAdmin ? 1 : 0, owner.id]);
        if (!rows.length) return false;
        for (const table of ['attempts', 'quiz_sessions']) await connection.execute(`DELETE FROM ${table} WHERE quiz_id=?`, [id]);
        await connection.execute('DELETE FROM public_quizzes WHERE id=?', [id]);
        await connection.execute('DELETE FROM quizzes WHERE id=?', [id]);
        return true;
      });
    },
    async attempt(id, quizId) {
      const [rows] = await pool.execute('SELECT result FROM attempts WHERE id=? AND quiz_id=?', [id, quizId]);
      return rows[0] ?? null;
    },
    async saveAttempt({ id, quizId, result }) {
      return transaction(pool, async connection => {
        // Serialize against closing/deleting the quiz and concurrent submissions.
        const [quizzes] = await connection.execute('SELECT id FROM quizzes WHERE id=? AND active=1 AND time_limit_minutes=0 FOR UPDATE', [quizId]);
        if (!quizzes.length) return null;
        // Ignore only a duplicate identifier; unlike INSERT IGNORE this does not
        // suppress invalid data, truncation or foreign-key failures.
        await connection.execute('INSERT INTO attempts(id,quiz_id,student,score,total,result,created) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id', [id, quizId, result.student, result.score, result.total, JSON.stringify(result), result.created]);
        const [rows] = await connection.execute('SELECT result FROM attempts WHERE id=? AND quiz_id=?', [id, quizId]);
        return rows[0] ?? null;
      });
    },
  };
}
