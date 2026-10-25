import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const sql=new DatabaseSync(':memory:');sql.exec(readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync('drizzle/'+f,'utf8')).join('\n').replaceAll('--> statement-breakpoint',''));sql.exec('PRAGMA foreign_keys=ON');
class Statement{constructor(query){this.query=query;this.values=[];}bind(...v){this.values=v;return this;}async all(){return {results:sql.prepare(this.query).all(...this.values)};}async first(){return sql.prepare(this.query).get(...this.values)||null;}async run(){return sql.prepare(this.query).run(...this.values);}}
globalThis.__timingEnv={DB:{prepare:q=>new Statement(q),batch:async qs=>{sql.exec('BEGIN');try{const out=qs.map(q=>sql.prepare(q.query).run(...q.values));sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}},QUIZ_TEACHER_EMAIL:'admin@example.test'};
// Optional MariaDB-route fixture. This exercises the same timing scenarios through
// native repository queries, while adapting SQL only for this isolated SQLite driver.
const namecheap=process.env.QUIZMINT_TIMING_TEST_RUNTIME==='namecheap';
let waiting=Promise.resolve();
if(namecheap){
 globalThis.__timingEnv.QUIZMINT_RUNTIME='namecheap';
 globalThis.__timingEnv.DB={prepare(){throw Error('D1 must not be used.');}};
 const execute=async(query,values=[])=>{
  const adapted=query.replace(/ FOR UPDATE$/,'').replace(/ ON DUPLICATE KEY UPDATE `key`=VALUES\(`key`\)$/,' ON CONFLICT(`key`) DO NOTHING').replace(/ ON DUPLICATE KEY UPDATE id=(?:attempts\.)?id$/,' ON CONFLICT(id) DO NOTHING').replace('CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)',"CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)");
  const statement=sql.prepare(adapted);
  return /^(SELECT|WITH)/.test(query)?[statement.all(...values)]:[statement.run(...values)];
 };
 sql.function('JSON_UNQUOTE',value=>value);
 globalThis.__timingPool={execute,getConnection:async()=>{
  const previous=waiting;let release;waiting=new Promise(resolve=>{release=resolve;});await previous;
  return {execute,beginTransaction:async()=>sql.exec('BEGIN'),commit:async()=>sql.exec('COMMIT'),rollback:async()=>sql.exec('ROLLBACK'),release:()=>release()};
 }};
 Object.assign(process.env,{DB_NAME:'isolated_timing_test',DB_USER:'test',DB_PASSWORD:'test-only'});
}
const plugin={name:'env',setup(b){
 b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));
 if(namecheap)b.onResolve({filter:/^mysql2\/promise$/},()=>({path:'mysql',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='env'?'export const env=globalThis.__timingEnv':'export const createPool=()=>globalThis.__timingPool',loader:'js'}));
}};
await build({entryPoints:['app/api/teacher/route.ts','app/api/library/route.ts','app/api/quiz/[id]/route.ts','app/api/quiz/[id]/session/route.ts'],outbase:'.',outdir:'.sites-runtime/timing-tests',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},plugins:[plugin]});
const teacher=await import('../.sites-runtime/timing-tests/app/api/teacher/route.mjs'),library=await import('../.sites-runtime/timing-tests/app/api/library/route.mjs'),student=await import('../.sites-runtime/timing-tests/app/api/quiz/[id]/route.mjs'),session=await import('../.sites-runtime/timing-tests/app/api/quiz/[id]/session/route.mjs');
const root='https://example.test',admin={'oai-authenticated-user-id':'admin','oai-authenticated-user-email':'admin@example.test'};
const request=(path,data,method='POST',headers={},origin=root)=>new Request(root+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:{})});
const draft={title:'Test timing',subject:'Maths',description:'Choose one answer.',questions:[{prompt:'2 + 2?',options:['1','2','3','4'],correct:3,explanation:'Two plus two makes four.'},{prompt:'1 + 1?',options:['1','2','3','4'],correct:1,explanation:'One plus one makes two.'}]};
for(const limit of [-1,241,1.5,'30',null]){if(limit===null)continue;assert.equal((await teacher.POST(request('/api/admin',{...draft,timeLimitMinutes:limit},'POST',admin))).status,400);}
async function create(limit){const r=await teacher.POST(request('/api/admin',{...draft,...(limit===undefined?{}:{timeLimitMinutes:limit})},'POST',admin));assert.equal(r.status,201);return (await r.json()).id;}
const untimed=await create(),timed=await create(1),params=id=>({params:Promise.resolve({id})});
assert.equal(sql.prepare('SELECT time_limit_minutes FROM quizzes WHERE id=?').get(untimed).time_limit_minutes,0);
const publicTimed=await (await student.GET(request('/api/quiz/'+timed,null,'GET'),params(timed))).json();assert.equal(publicTimed.timeLimitMinutes,1);assert.ok(!JSON.stringify(publicTimed).includes('correct'));
const call=(id,data,origin=root)=>session.POST(request('/api/quiz/'+id+'/session',data,'POST',{},origin),params(id));
assert.equal((await call(untimed,{action:'start',student:'learner@example.test'},'https://evil.test')).status,403);
assert.equal((await call(untimed,{action:'start',student:'invalid'})).status,400);
let start=await call(untimed,{action:'start',student:'Learner@example.test'});assert.equal(start.status,201,await start.clone().text());const u=await start.json();assert.equal(u.deadline,0);assert.equal(u.student,'learner@example.test');assert.match(u.token,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(u.quiz).includes('correct'));assert.ok(!JSON.stringify(u.quiz).includes('explanation'));
const dbRow=sql.prepare('SELECT * FROM quiz_sessions WHERE quiz_id=?').get(untimed);assert.notEqual(dbRow.token_hash,u.token);assert.ok(!JSON.stringify(dbRow).includes(u.token),'Only the token digest is persisted');
assert.equal((await call(untimed,{action:'resume',student:'learner@example.test'})).status,401,'Email is not proof of access');assert.equal((await call(timed,{action:'resume',token:u.token})).status,404,'Tokens cannot cross quiz boundaries');
let saved=await call(untimed,{action:'save',token:u.token,answers:[3,-1],step:1,revision:0});assert.equal(saved.status,200);assert.equal((await saved.json()).revision,1);
assert.equal((await call(untimed,{action:'save',token:u.token,answers:[0,0],step:0,revision:0})).status,409,'Stale tabs cannot overwrite saved progress');
const resumed=await (await call(untimed,{action:'resume',token:u.token})).json();assert.deepEqual(resumed.answers,[3,-1]);assert.equal(resumed.step,1);assert.equal(resumed.revision,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM attempts').get().n,0,'No result exists before completion');
assert.equal((await call(untimed,{action:'submit',token:u.token,answers:[3,-1]})).status,400);
assert.equal((await call(untimed,{action:'save',token:u.token,answers:[3,8],step:1,revision:1})).status,400);
assert.equal((await call(untimed,{action:'save',token:u.token,answers:[3,1],step:2,revision:1})).status,400);
// Attempt snapshots protect existing progress if source content changes.
sql.prepare('UPDATE quizzes SET questions=? WHERE id=?').run(JSON.stringify(draft.questions.map(q=>({...q,correct:0}))),untimed);
const concurrent=await Promise.all([call(untimed,{action:'submit',token:u.token,answers:[3,1]}),call(untimed,{action:'submit',token:u.token,answers:[0,0]})]);assert.ok(concurrent.every(r=>r.status===200));const outcomes=await Promise.all(concurrent.map(r=>r.json()));assert.equal(outcomes[0].result.score,outcomes[1].result.score);assert.equal(outcomes[0].result.score,2,'The original answer key is used');assert.equal(sql.prepare('SELECT COUNT(*) n FROM attempts WHERE quiz_id=?').get(untimed).n,1,'Concurrent submit is idempotent');
assert.equal((await (await call(untimed,{action:'save',token:u.token,answers:[0,0],step:0,revision:1})).json()).result.score,2,'Finished scores cannot change');
// Deadline, partial grading and rejection of new answers after expiry.
const t=await (await call(timed,{action:'start',student:'timed@example.test'})).json();assert.ok(t.deadline-t.serverNow>59000&&t.deadline-t.serverNow<=60000);
assert.equal((await student.POST(request('/api/quiz/'+timed,{student:'timed@example.test',answers:[3,1],attemptId:crypto.randomUUID()}),params(timed))).status,400,'Legacy API cannot bypass a timed start');
await call(timed,{action:'save',token:t.token,answers:[3,-1],step:1,revision:0});sql.prepare('UPDATE quiz_sessions SET deadline=? WHERE quiz_id=?').run(Date.now()-1000,timed);
const expired=await (await call(timed,{action:'submit',token:t.token,answers:[3,1]})).json();assert.equal(expired.result.score,1);assert.equal(expired.result.timedOut,true);assert.equal(expired.result.feedback[1].selected,-1);assert.equal((await (await call(timed,{action:'resume',token:t.token})).json()).result.score,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM attempts WHERE quiz_id=?').get(timed).n,1);
const timely=await (await call(timed,{action:'start',student:'early@example.test'})).json();const early=await (await call(timed,{action:'submit',token:timely.token,answers:[3,1]})).json();assert.equal(early.result.score,2);assert.equal(early.result.timedOut,false);
// Returning after an expired page was closed finalises its saved answers.
const returnId=await create(5),returning=await (await call(returnId,{action:'start',student:'return@example.test'})).json();sql.prepare('UPDATE quiz_sessions SET deadline=? WHERE quiz_id=?').run(Date.now()-1000,returnId);const returned=await (await call(returnId,{action:'resume',token:returning.token})).json();assert.equal(returned.result.score,0);assert.equal(returned.result.timedOut,true);
const long=await create(0),longRun=await (await call(long,{action:'start',student:'long@example.test'})).json();sql.prepare('UPDATE quiz_sessions SET started=1,updated=1 WHERE quiz_id=?').run(long);assert.equal((await call(long,{action:'resume',token:longRun.token})).status,200,'Untimed progress has no automatic expiry');
await teacher.PATCH(request('/api/admin',{id:long,active:false},'PATCH',admin));assert.equal((await call(long,{action:'resume',token:longRun.token})).status,404);await teacher.PATCH(request('/api/admin',{id:long,active:true},'PATCH',admin));assert.equal((await call(long,{action:'resume',token:longRun.token})).status,200);
if(!namecheap){assert.equal((await library.PATCH(request('/api/library',{id:timed,published:true,consent:true},'PATCH',admin))).status,200);const clone=await library.POST(request('/api/library',{id:timed},'POST',admin));assert.equal(clone.status,201);assert.equal(sql.prepare('SELECT time_limit_minutes FROM quizzes WHERE id=?').get((await clone.json()).id).time_limit_minutes,1,'Public copies retain timing');}
assert.equal((await teacher.DELETE(request('/api/admin?id='+long,null,'DELETE',admin))).status,200);assert.equal(sql.prepare('SELECT COUNT(*) n FROM quiz_sessions WHERE quiz_id=?').get(long).n,0);assert.equal((await call(long,{action:'resume',token:longRun.token})).status,404);
sql.close();console.log((namecheap?'Namecheap timed route fixture: ':'')+'Passed: timing bounds/defaults'+(namecheap?'': '/copies')+', hidden answers, private token hashes, email isolation, origin guards, untimed persistence, stale saves, immutable snapshots, concurrent submit deduplication, deadline enforcement, partial grading, offline return, legacy bypass rejection, close/reopen and progress deletion.');
