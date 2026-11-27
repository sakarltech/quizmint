import { transaction } from './namecheap.mjs';

export function libraryRepository(pool) {
  return {
    async get(id) {
      const [rows] = await pool.execute('SELECT id,quiz,copies FROM public_quizzes WHERE id=? AND published=1', [id]);
      return rows[0] ?? null;
    },
    async list(words, offset) {
      if (words.length > 10 || words.some(word => !/^[\p{L}\p{N}]+$/u.test(word))) throw new Error('Invalid search terms.');
      // Explicit LOWER keeps search case-insensitive under the schema's binary
      // collation, and short subject names remain searchable (unlike stopword /
      // minimum-token defaults in FULLTEXT). All supplied words must match.
      const filter = words.map(() => " AND LOWER(CONCAT_WS(' ',title,subject)) LIKE ?").join('');
      const [rows] = await pool.execute("SELECT id,title,subject,JSON_UNQUOTE(JSON_EXTRACT(quiz,'$.description')) description,JSON_LENGTH(JSON_EXTRACT(quiz,'$.questions')) questions,copies FROM public_quizzes WHERE published=1" + filter + ' ORDER BY created DESC,id DESC LIMIT 21 OFFSET ?', [...words.map(word => '%' + word.toLowerCase() + '%'), offset]);
      return rows;
    },
    async copy({ sourceId, sourceSnapshot, id, ownerId, quiz, created }) {
      return transaction(pool, async connection => {
        const [rows] = await connection.execute('SELECT quiz FROM public_quizzes WHERE id=? AND published=1 FOR UPDATE', [sourceId]);
        // Reject if publication changed after the route validated its snapshot.
        if (!rows.length || rows[0].quiz !== sourceSnapshot) return false;
        await connection.execute('INSERT INTO quizzes(id,title,subject,description,questions,created,owner_id,time_limit_minutes) VALUES(?,?,?,?,?,?,?,?)', [id, quiz.title, quiz.subject, quiz.description, JSON.stringify(quiz.questions), created, ownerId, quiz.timeLimitMinutes]);
        await connection.execute('UPDATE public_quizzes SET copies=copies+1 WHERE id=?', [sourceId]);
        return true;
      });
    },
    async unpublish(id) {
      await pool.execute('UPDATE public_quizzes SET published=0 WHERE id=?', [id]);
    },
    async publish({ id, ownerId, quiz, created }) {
      await transaction(pool, async connection => {
        const [source] = await connection.execute("SELECT id FROM quizzes WHERE id=? AND (owner_id=? OR (owner_id IS NULL AND ?='admin')) FOR UPDATE", [id, ownerId, ownerId]);
        if (!source.length) throw new Error('Quiz not found.');
      await connection.execute('INSERT INTO public_quizzes(id,owner_id,title,subject,quiz,published,created) VALUES(?,?,?,?,?,1,?) ON DUPLICATE KEY UPDATE title=VALUES(title),subject=VALUES(subject),quiz=VALUES(quiz),published=1', [id, ownerId, quiz.title, quiz.subject, JSON.stringify(quiz), created]);
      });
    },
    async profile(userId) {
      const [rows] = await pool.execute('SELECT profile,updated FROM creator_profiles WHERE user_id=?', [userId]);
      return rows[0] ?? null;
    },
    async saveProfile(userId, profile, updated) {
      await pool.execute('INSERT INTO creator_profiles(user_id,profile,updated) VALUES(?,?,?) ON DUPLICATE KEY UPDATE profile=VALUES(profile),updated=VALUES(updated)', [userId, JSON.stringify(profile), updated]);
    },
  };
}
