export function quizTestTables(suffix) {
  if (!/^[a-f0-9]{12}$/.test(suffix)) throw new Error('Invalid test table suffix.');
  const sources = ['quizzes', 'attempts', 'quiz_sessions', 'public_quizzes'];
  const names = Object.fromEntries(sources.map(name => [name, `qm_check_${suffix}_${name}`]));
  return {
    definitions: sources.map(name => name === 'public_quizzes'
      // Temporary InnoDB tables cannot have FULLTEXT indexes. This read-only
      // metadata copy keeps all columns without the permanent search index.
      ? `CREATE TEMPORARY TABLE \`${names[name]}\` AS SELECT * FROM \`${name}\` WHERE 1=0`
      : `CREATE TEMPORARY TABLE \`${names[name]}\` LIKE \`${name}\``),
    sql: statement => statement.replace(/\b(quizzes|attempts|quiz_sessions|public_quizzes)\b/g, name => names[name]),
  };
}
