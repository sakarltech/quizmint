import { initialSchema } from './namecheap-schema.mjs';

export async function libraryTestTables(suffix) {
  if (!/^[a-f0-9]{12}$/.test(suffix)) throw new Error('Invalid test table suffix.');
  const schema = await initialSchema();
  const sources = ['quizzes', 'public_quizzes', 'creator_profiles'];
  const names = Object.fromEntries(sources.map(name => [name, `qm_check_${suffix}_${name}`]));
  return {
    // Keep the real columns/unique keys but omit FULLTEXT, which InnoDB temporary
    // tables cannot support. No foreign keys are present in these source tables.
    definitions: sources.map(name => schema.statements[schema.tables.indexOf(name)]
      .replace(`CREATE TABLE \`${name}\``, `CREATE TEMPORARY TABLE \`${names[name]}\``)
      .replace(/,\n  FULLTEXT KEY[^\n]+/g, '')),
    sql: statement => statement.replace(/\b(quizzes|public_quizzes|creator_profiles)\b/g, name => names[name]),
  };
}
