import { randomUUID } from 'node:crypto';
import { namecheapDatabase, closeNamecheapDatabase } from '../db/namecheap.mjs';
import { aiRepository } from '../db/namecheap-ai.mjs';
import { exerciseAiStore } from '../tests/helpers/namecheap-ai-checks.mjs';
let connection,phase='connection';
try {
  connection=await (await namecheapDatabase()).getConnection();
  const sources=['ai_wallets','ai_jobs','ai_payments'],suffix=randomUUID().replaceAll('-','').slice(0,12);
  const names=Object.fromEntries(sources.map(name=>[name,`qm_check_${suffix}_${name}`]));
  phase='temporary tables';
  for(const source of sources)await connection.query(`CREATE TEMPORARY TABLE \`${names[source]}\` LIKE \`${source}\``);
  const map=sql=>sql.replace(/\b(ai_wallets|ai_jobs|ai_payments)\b/g,name=>names[name]);
  let fail=false;
  const execute=(sql,values)=>{
    if(fail&&sql.startsWith('UPDATE ai_wallets SET credits=credits+?')){fail=false;throw Error('Synthetic payment failure');}
    return connection.execute(map(sql),values);
  };
  const pool={execute,getConnection:async()=>({execute,beginTransaction:()=>connection.beginTransaction(),commit:()=>connection.commit(),rollback:()=>connection.rollback(),release(){}})};
  phase='wallet/payment scenarios';
  await exerciseAiStore({store:aiRepository(pool),execute,failNextPayment:()=>{fail=true;}});
  console.log('MariaDB AI wallet/payment checks passed: reservations, refunds, monthly allowances, saved jobs, duplicate payments, subscriptions and rollback. Permanent balances unchanged. No provider calls or charges.');
} catch(error){
  const code=typeof error?.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:null;
  console.error(`AI wallet/payment checks failed during ${phase}${code?` (${code})`:''}.`);process.exitCode=1;
} finally {
  if(connection)connection.destroy();
  await closeNamecheapDatabase();
}
