import { transaction } from './namecheap.mjs';

export function surveyRepository(pool) {
  const rows = async (connection, sql, bindings) => (await connection.execute(sql, bindings))[0];
  const first = async (connection, sql, bindings) => (await rows(connection, sql, bindings))[0] ?? null;
  const lock = (connection, id) => first(connection, 'SELECT owner_id,survey,active FROM surveys WHERE id=? FOR UPDATE', [id]);
  return {
    async list(owner) {
      const result = await rows(pool, 'SELECT s.id,s.survey,s.active,s.created,(SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id=s.id) AS responses FROM surveys s WHERE owner_id=? ORDER BY created DESC,id DESC LIMIT 100', [owner]);
      return result.map(row => ({ ...row, responses: Number(row.responses) }));
    },
    get(id, owner) {
      return owner === undefined
        ? first(pool, 'SELECT survey,active FROM surveys WHERE id=?', [id])
        : first(pool, 'SELECT survey,active FROM surveys WHERE id=? AND owner_id=?', [id, owner]);
    },
    results(id, owner) {
      return transaction(pool, async connection => {
        const survey = await lock(connection, id);
        if (!survey || survey.owner_id !== owner) return null;
        const count = await first(connection, 'SELECT COUNT(*) AS response_count FROM survey_responses WHERE survey_id=?', [id]);
        const responses = await rows(connection, 'SELECT identifier,answers,seen,created FROM survey_responses WHERE survey_id=? ORDER BY created DESC,id DESC LIMIT 1000', [id]);
        return { survey: survey.survey, active: survey.active, count: Number(count.response_count), responses };
      });
    },
    async create(id, owner, survey, now) {
      await pool.execute('INSERT INTO surveys(id,owner_id,survey,created,updated) VALUES(?,?,?,?,?)', [id, owner, survey, now, now]);
    },
    setActive(id, owner, active, now) {
      return transaction(pool, async connection => {
        const survey = await lock(connection, id);
        if (!survey || survey.owner_id !== owner) return false;
        await connection.execute('UPDATE surveys SET active=?,updated=? WHERE id=?', [active ? 1 : 0, now, id]);
        return true;
      });
    },
    update(id, owner, expected, survey, lockedFields, now) {
      return transaction(pool, async connection => {
        const current = await lock(connection, id);
        if (!current || current.owner_id !== owner) return 'missing';
        if (current.survey !== expected) return 'conflict';
        if (lockedFields && await first(connection, 'SELECT id FROM survey_responses WHERE survey_id=? LIMIT 1', [id])) return 'conflict';
        await connection.execute('UPDATE surveys SET survey=?,updated=? WHERE id=?', [survey, now, id]);
        return 'updated';
      });
    },
    submit({id, surveyId, expected, identifier, answers, seen, created}) {
      return transaction(pool, async connection => {
        const survey = await lock(connection, surveyId);
        if (!survey) return false;
        const prior = await first(connection, 'SELECT survey_id FROM survey_responses WHERE id=?', [id]);
        if (prior) return prior.survey_id === surveyId;
        if (!survey.active || survey.survey !== expected) return false;
        try {
          await connection.execute('INSERT INTO survey_responses(id,survey_id,identifier,answers,seen,created) VALUES(?,?,?,?,?,?)', [id, surveyId, identifier, answers, seen, created]);
          return true;
        } catch (error) {
          if (error?.code === 'ER_DUP_ENTRY') return false;
          throw error;
        }
      });
    },
    async remove(id, owner) {
      const [result] = await pool.execute('DELETE FROM surveys WHERE id=? AND owner_id=?', [id, owner]);
      return result.affectedRows === 1;
    },
  };
}
