import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export function aiDriverFixture(){
  const sql=new DatabaseSync(':memory:');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
  let waiting=Promise.resolve(),fail=false;
  const execute=async(query,values=[])=>{
    if(fail&&query.startsWith('UPDATE ai_wallets SET credits=credits+?')){fail=false;throw Error('Synthetic payment failure');}
    const adapted=query.replace(/ FOR UPDATE$/,'').replace(/\bLEAST\(/g,'MIN(').replace(/\bGREATEST\(/g,'MAX(').replace(/ ON DUPLICATE KEY UPDATE user_id=VALUES\(user_id\)$/,' ON CONFLICT(user_id) DO NOTHING');
    const statement=sql.prepare(adapted);return query.startsWith('SELECT')?[statement.all(...values)]:[statement.run(...values)];
  };
  const pool={execute,getConnection:async()=>{
    const previous=waiting;let release;waiting=new Promise(resolve=>{release=resolve;});await previous;
    return {execute,beginTransaction:async()=>sql.exec('BEGIN'),commit:async()=>sql.exec('COMMIT'),rollback:async()=>sql.exec('ROLLBACK'),release:()=>release()};
  }};
  return {pool,execute,sql,failNextPayment:()=>{fail=true;},close:()=>sql.close()};
}
