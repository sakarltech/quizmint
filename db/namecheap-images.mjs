export function imageRepository(pool) {
  return {
    async used(id, now = Date.now()) {
      if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw Error('Invalid image identifier.');
      // ids are hexadecimal, so JSON_SEARCH's LIKE wildcards cannot broaden the
      // match. Search only the image.id field of question array entries.
      const [quizzes] = await pool.execute("SELECT id FROM quizzes WHERE JSON_SEARCH(questions,'one',?,NULL,'$[*].image.id') IS NOT NULL LIMIT 1", [id]);
      if (quizzes.length) return true;
      const [rooms] = await pool.execute("SELECT code FROM arena_rooms WHERE expires>? AND JSON_SEARCH(questions,'one',?,NULL,'$[*].image.id') IS NOT NULL LIMIT 1", [now, id]);
      return rooms.length > 0;
    },
  };
}
