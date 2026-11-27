// Used only by the hosting account-query check. Distinct names avoid MariaDB's
// ER_NONUNIQ_TABLE for CREATE TEMPORARY TABLE x LIKE x on some server versions.
export function accountTestTables(suffix) {
  if (!/^[a-f0-9]{12}$/.test(suffix)) throw new Error('Invalid test table suffix.');
  const sources = ['creator_users', 'creator_sessions', 'auth_limits'];
  const names = Object.fromEntries(sources.map(name => [name, `qm_check_${suffix}_${name}`]));
  return {
    definitions: sources.map(name => `CREATE TEMPORARY TABLE \`${names[name]}\` LIKE \`${name}\``),
    sql: statement => statement.replace(/\b(creator_users|creator_sessions|auth_limits)\b/g, name => names[name]),
  };
}
