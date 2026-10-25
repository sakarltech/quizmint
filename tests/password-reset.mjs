import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const sql=new DatabaseSync(':memory:');sql.exec(readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync('drizzle/'+f,'utf8')).join('\n').replaceAll('--> statement-breakpoint',''));
let staleLogin=false;
class Statement{constructor(query){this.query=query;this.values=[];}bind(...v){this.values=v;return this;}async first(){const row=sql.prepare(this.query).get(...this.values)||null;if(staleLogin&&this.query==='SELECT * FROM creator_users WHERE email=?'&&this.values[0]==='stale@example.test'){sql.prepare('UPDATE creator_users SET password_hash=?,salt=? WHERE id=?').run('f'.repeat(64),'changed-during-login',row.id);staleLogin=false;}return row;}async run(){return sql.prepare(this.query).run(...this.values);}}
globalThis.__resetEnv={DB:{prepare:q=>new Statement(q),batch:async qs=>{sql.exec('BEGIN');try{const out=qs.map(q=>sql.prepare(q.query).run(...q.values));sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
const namecheap=process.env.QUIZMINT_RESET_TEST_RUNTIME==='namecheap';
let waiting=Promise.resolve();
if(namecheap){
 globalThis.__resetEnv.QUIZMINT_RUNTIME='namecheap';
 globalThis.__resetEnv.DB={prepare(){throw Error('D1 must not be used.');}};
 const execute=async(query,values=[])=>{
  const adapted=query.replace(/ FOR UPDATE$/,'')
   .replace(/ ON DUPLICATE KEY UPDATE `key`=VALUES\(`key`\)$/,' ON CONFLICT(`key`) DO NOTHING')
   .replace(/ ON DUPLICATE KEY UPDATE token_hash=VALUES\(token_hash\),password_hash=VALUES\(password_hash\),expires=VALUES\(expires\),used=0,created=VALUES\(created\)$/,' ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,password_hash=excluded.password_hash,expires=excluded.expires,used=0,created=excluded.created')
   .replaceAll('CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)',"CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)");
  const statement=sql.prepare(adapted);
  if(query.startsWith('SELECT')){
   const rows=statement.all(...values);
   if(staleLogin&&query==='SELECT id,email,password_hash,salt,created FROM creator_users WHERE email=?'&&values[0]==='stale@example.test'){
    sql.prepare('UPDATE creator_users SET password_hash=?,salt=? WHERE id=?').run('f'.repeat(64),'changed-during-login',rows[0].id);staleLogin=false;
   }
   return [rows];
  }
  try{return [statement.run(...values)];}catch(error){if(/UNIQUE constraint/.test(error.message))error.code='ER_DUP_ENTRY';throw error;}
 };
 globalThis.__resetPool={execute,getConnection:async()=>{
  const previous=waiting;let release;waiting=new Promise(resolve=>{release=resolve;});await previous;
  return {execute,beginTransaction:async()=>sql.exec('BEGIN'),commit:async()=>sql.exec('COMMIT'),rollback:async()=>sql.exec('ROLLBACK'),release:()=>release()};
 }};
 Object.assign(process.env,{DB_NAME:'isolated_reset_test',DB_USER:'test',DB_PASSWORD:'test-only'});
}
const plugin={name:'test-env',setup(b){
 b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));
 if(namecheap){
  b.onResolve({filter:/^mysql2\/promise$/},()=>({path:'mysql',namespace:'test'}));
  b.onResolve({filter:/^nodemailer$/},()=>({path:'smtp',namespace:'test'}));
 }
 b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='env'?'export const env=globalThis.__resetEnv':args.path==='mysql'?'export const createPool=()=>globalThis.__resetPool':'export default {createTransport:()=>({sendMail:message=>globalThis.__resetSmtpSend(message)})}',loader:'js'}));
}};
await build({entryPoints:['app/api/account/route.ts','app/api/password-reset/request/route.ts','app/api/password-reset/complete/route.ts','lib/runtime-context.ts'],outbase:'.',outdir:'.sites-runtime/reset-tests',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},plugins:[plugin]});
const account=await import('../.sites-runtime/reset-tests/app/api/account/route.mjs'),requestReset=await import('../.sites-runtime/reset-tests/app/api/password-reset/request/route.mjs'),complete=await import('../.sites-runtime/reset-tests/app/api/password-reset/complete/route.mjs'),{withRuntimeContext}=await import('../.sites-runtime/reset-tests/lib/runtime-context.mjs');
const root='https://www.quizmint.co.uk';const request=(path,data,ip='test',origin=root,cookie)=>new Request(root+path,{method:'POST',headers:{Origin:origin,'cf-connecting-ip':ip,'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});
const email='creator@example.test',oldPassword='old-secure-password-123',newPassword='new-secure-password-456';
const register=await account.POST(request('/api/account',{action:'register',email,password:oldPassword}));assert.equal(register.status,200);const cookie=register.headers.get('set-cookie').split(';')[0];
assert.equal((await requestReset.GET()).status,200);assert.equal((await (await requestReset.GET()).json()).enabled,false);
assert.equal((await requestReset.POST(request('/api/password-reset/request',{email}))).status,503);
assert.equal((await requestReset.POST(request('/api/password-reset/request',{email},'x','https://evil.test'))).status,403);
assert.equal((await complete.POST(request('/api/password-reset/complete',{},'x','https://evil.test'))).status,403);
globalThis.__resetEnv.RESEND_API_KEY='test-only';globalThis.__resetEnv.EMAIL_FROM='QuizMint <no-reply@quizmint.co.uk>';
if(namecheap)Object.assign(globalThis.__resetEnv,{APP_URL:root,SMTP_HOST:'mail.quizmint.co.uk',SMTP_PORT:'465',SMTP_USER:'hello@quizmint.co.uk',SMTP_PASSWORD:'test-only'});
const actualFetch=globalThis.fetch;let sent=[],deliveryFailure=false;
globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');const message=JSON.parse(options.body);sent.push(message);assert.ok(options.headers['Idempotency-Key']);return Response.json(deliveryFailure?{error:'test failure'}:{id:'mail-test'},{status:deliveryFailure?500:200});};
if(namecheap)globalThis.__resetSmtpSend=async message=>{sent.push({...message,to:[message.to.address]});assert.ok(message.html.includes('QuizMint'));if(deliveryFailure)throw Error('Synthetic SMTP failure');return {accepted:[message.to.address],rejected:[]};};
let tasks=[];const context={waitUntil:p=>tasks.push(p)};
const known=await withRuntimeContext(context,()=>requestReset.POST(request('/api/password-reset/request',{email:email.toUpperCase()})));await Promise.all(tasks);tasks=[];
const unknown=await withRuntimeContext(context,()=>requestReset.POST(request('/api/password-reset/request',{email:'missing@example.test'})));await Promise.all(tasks);tasks=[];
assert.equal(known.status,202);assert.deepEqual(await known.json(),await unknown.json(),'Account existence is not disclosed');assert.equal(sent.length,1,'No mail goes to unknown addresses');
const firstToken=sent[0].text.match(/#token=([a-f0-9]{64})/)[1];assert.ok(sent[0].text.includes('https://www.quizmint.co.uk/reset-password#'));const stored=sql.prepare('SELECT * FROM creator_password_resets').get();assert.notEqual(stored.token_hash,firstToken);assert.ok(!JSON.stringify(stored).includes(firstToken),'Raw recovery secret is not stored');
assert.equal((await account.GET(new Request(root+'/api/account',{headers:{cookie}}))).status,200,'Requesting reset does not revoke sessions');
await withRuntimeContext(context,()=>requestReset.POST(request('/api/password-reset/request',{email},'test-2')));await Promise.all(tasks);tasks=[];const token=sent.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];
assert.equal((await complete.POST(request('/api/password-reset/complete',{token:firstToken,password:newPassword,confirmPassword:newPassword}))).status,400,'Newest link replaces old links');
assert.equal((await complete.POST(request('/api/password-reset/complete',{token,password:'short',confirmPassword:'short'}))).status,400);
assert.equal((await complete.POST(request('/api/password-reset/complete',{token,password:newPassword,confirmPassword:'different-password'}))).status,400);
const result=await withRuntimeContext(context,()=>complete.POST(request('/api/password-reset/complete',{token,password:newPassword,confirmPassword:newPassword})));await Promise.all(tasks);tasks=[];assert.equal(result.status,200);assert.ok(result.headers.get('set-cookie').includes('Max-Age=0'));assert.ok(!JSON.stringify(await result.json()).includes(token));assert.ok(!sent.at(-1).text.includes(newPassword),'Notification never contains password');
assert.equal((await account.GET(new Request(root+'/api/account',{headers:{cookie}}))).status,401,'All old sessions are revoked');assert.equal((await complete.POST(request('/api/password-reset/complete',{token,password:newPassword,confirmPassword:newPassword}))).status,400,'Token replay rejected');
assert.equal((await account.POST(request('/api/account',{action:'login',email,password:oldPassword},'login'))).status,401);assert.equal((await account.POST(request('/api/account',{action:'login',email,password:newPassword},'login'))).status,200);
// Expiration and failed delivery remain fail-closed.
await withRuntimeContext(context,()=>requestReset.POST(request('/api/password-reset/request',{email},'test-3')));await Promise.all(tasks);tasks=[];const expired=sent.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];sql.prepare('UPDATE creator_password_resets SET expires=1').run();assert.equal((await complete.POST(request('/api/password-reset/complete',{token:expired,password:newPassword,confirmPassword:newPassword}))).status,400);
deliveryFailure=true;await withRuntimeContext(context,()=>requestReset.POST(request('/api/password-reset/request',{email:'missing@example.test'},'test-4')));await Promise.all(tasks);tasks=[];
// Fresh account avoids a deliberately exhausted per-address request allowance.
const second=await account.POST(request('/api/account',{action:'register',email:'second@example.test',password:oldPassword},'second'));assert.equal(second.status,200);await withRuntimeContext(context,()=>requestReset.POST(request('/api/password-reset/request',{email:'second@example.test'},'second')));await Promise.all(tasks);tasks=[];assert.ok(sql.prepare("SELECT r.used FROM creator_password_resets r JOIN creator_users u ON u.id=r.user_id WHERE u.email='second@example.test'").get().used>0,'Undelivered links are invalidated');
deliveryFailure=false;
// Concurrent consumption of one token allows precisely one password change.
const third=await account.POST(request('/api/account',{action:'register',email:'race@example.test',password:oldPassword},'race'));assert.equal(third.status,200);await withRuntimeContext(context,()=>requestReset.POST(request('/api/password-reset/request',{email:'race@example.test'},'race')));await Promise.all(tasks);tasks=[];const raceToken=sent.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];const raced=await withRuntimeContext(context,()=>Promise.all([complete.POST(request('/api/password-reset/complete',{token:raceToken,password:newPassword,confirmPassword:newPassword},'race')),complete.POST(request('/api/password-reset/complete',{token:raceToken,password:'other-secure-password-789',confirmPassword:'other-secure-password-789'},'race'))]));await Promise.all(tasks);tasks=[];assert.deepEqual(raced.map(r=>r.status).sort(),[200,400]);
for(let i=0;i<11;i++)var limited=await requestReset.POST(request('/api/password-reset/request',{email:'unknown-'+i+'@example.test'},'limited'));assert.equal(limited.status,429);
await account.POST(request('/api/account',{action:'register',email:'stale@example.test',password:oldPassword},'stale'));staleLogin=true;const stale=await account.POST(request('/api/account',{action:'login',email:'stale@example.test',password:oldPassword},'stale'));assert.equal(stale.status,401);assert.equal(stale.headers.get('set-cookie'),null,'A login with a stale password snapshot cannot issue a session');
globalThis.fetch=actualFetch;sql.close();console.log('Passed: reset availability/origin guards, generic replies, known recipients only, hashed/single-use/expiring tokens, latest-link invalidation, password policy, atomic races, session revocation, login after reset, delivery failures and rate limits.');
