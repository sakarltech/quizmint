import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const sql=new DatabaseSync(':memory:');
sql.exec(readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync('drizzle/'+f,'utf8')).join('\n').replaceAll('--> statement-breakpoint',''));
class Statement{constructor(query){this.query=query;}bind(...values){this.values=values;return this;}async run(){return sql.prepare(this.query).run(...this.values);}async first(){return sql.prepare(this.query).get(...this.values);}}
globalThis.__allowanceEnv={DB:{prepare:q=>new Statement(q),batch:async statements=>{sql.exec('BEGIN');try{for(const statement of statements)await statement.run();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}}};
await build({entryPoints:['lib/ai-server.ts','lib/free-allowance.ts'],outdir:'.sites-runtime/monthly-tests',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},plugins:[{name:'test-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__allowanceEnv',loader:'js'}));}}]});
const {wallet,refundReservation}=await import('../.sites-runtime/monthly-tests/ai-server.mjs');
const {freeAllowancePeriod}=await import('../.sites-runtime/monthly-tests/free-allowance.mjs');
assert.equal(freeAllowancePeriod(Date.parse('2026-06-30T22:59:59Z')).resetsAt,Date.parse('2026-06-30T23:00:00Z'));
assert.equal(freeAllowancePeriod(Date.parse('2026-06-30T23:00:00Z')).start,Date.parse('2026-06-30T23:00:00Z'),'Summer reset is midnight UK time');
assert.equal(freeAllowancePeriod(Date.parse('2026-12-31T23:59:59Z')).resetsAt,Date.parse('2027-01-01T00:00:00Z'),'Winter/year boundary');
const realNow=Date.now;let now=Date.parse('2026-10-15T12:00:00Z');Date.now=()=>now;
try{
 let w=await wallet('creator');assert.equal(w.free_remaining,20);
 sql.prepare('UPDATE ai_wallets SET free_remaining=7,credits=50 WHERE user_id=?').run('creator');
 assert.equal((await wallet('creator')).free_remaining,7,'Repeated access within a month does not refill');
 now=Date.parse('2026-11-01T00:00:00Z');
 const concurrent=await Promise.all(Array.from({length:10},()=>wallet('creator')));
 assert.ok(concurrent.every(w=>w.free_remaining===20),'Concurrent first access sets 20 rather than adding 20');
 assert.equal(concurrent[0].credits,50,'Purchased credits are untouched');
 sql.prepare('UPDATE ai_wallets SET free_remaining=0 WHERE user_id=?').run('creator');
 now=Date.parse('2027-02-01T00:00:00Z');assert.equal((await wallet('creator')).free_remaining,20,'Skipped months do not accumulate');
 sql.prepare("INSERT INTO ai_jobs(id,user_id,free,paid,status,created) VALUES('old','creator',10,4,'running',?)").run(Date.parse('2027-01-31T23:59:00Z'));
 sql.prepare("UPDATE ai_wallets SET free_remaining=12,credits=46,lock_id='old',locked_until=0 WHERE user_id='creator'").run();
 await refundReservation('creator','old',true);w=await wallet('creator');assert.equal(w.free_remaining,12,'Previous-month refund cannot refill spent current-month credits');assert.equal(w.credits,50,'Previous-month paid credits are refunded');
 await refundReservation('creator','old',true);assert.equal((await wallet('creator')).credits,50,'Recovery is idempotent');
 sql.prepare("INSERT INTO ai_jobs(id,user_id,free,paid,status,created) VALUES('current','creator',10,0,'running',?)").run(now);
 sql.prepare("UPDATE ai_wallets SET lock_id='current',locked_until=0 WHERE user_id='creator'").run();
 await refundReservation('creator','current');assert.equal((await wallet('creator')).free_remaining,20,'Refunds cannot exceed the cap');
 sql.prepare("INSERT INTO ai_wallets(user_id,free_remaining) VALUES('legacy',3),('invalid',32)").run();
 assert.equal((await wallet('legacy')).free_remaining,3,'Migration preserves current-month usage');assert.equal((await wallet('invalid')).free_remaining,20,'Historical overflow is capped');
 now=Date.parse('2027-03-01T00:00:00Z');assert.equal((await wallet('legacy')).free_remaining,20,'Existing accounts receive the next monthly refill');
}finally{Date.now=realNow;sql.close();}
console.log('Passed: UK month boundaries, concurrent reset, no rollover, skipped months, paid credit preservation, capped/idempotent refunds, previous-month jobs and legacy migration.');
