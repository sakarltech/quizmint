import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
const sql = new DatabaseSync(':memory:');
for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + file, 'utf8'));
sql.function('JSON_UNQUOTE', value => value);
sql.function('JSON_LENGTH', value => JSON.parse(value).length);
sql.function('CONCAT_WS', { varargs: true }, (separator, ...values) => values.join(separator));
let failCounter = false;
const execute = async (query, values = []) => {
  if (failCounter && query.startsWith('UPDATE public_quizzes SET copies=')) throw Error('Synthetic counter failure');
  const adapted = query.replace(/ FOR UPDATE$/, '')
    .replace(/ ON DUPLICATE KEY UPDATE `key`=VALUES\(`key`\)$/, ' ON CONFLICT(`key`) DO NOTHING')
    .replace(/ ON DUPLICATE KEY UPDATE title=VALUES\(title\),subject=VALUES\(subject\),quiz=VALUES\(quiz\),published=1$/, ' ON CONFLICT(id) DO UPDATE SET title=excluded.title,subject=excluded.subject,quiz=excluded.quiz,published=1')
    .replace(/ ON DUPLICATE KEY UPDATE profile=VALUES\(profile\),updated=VALUES\(updated\)$/, ' ON CONFLICT(user_id) DO UPDATE SET profile=excluded.profile,updated=excluded.updated');
  const statement = sql.prepare(adapted);
  return /^(SELECT|WITH)/.test(query) ? [statement.all(...values)] : [statement.run(...values)];
};
globalThis.__libraryPool = { execute, getConnection: async () => ({ execute, beginTransaction: async () => sql.exec('BEGIN'), commit: async () => sql.exec('COMMIT'), rollback: async () => sql.exec('ROLLBACK'), release() {} }) };
globalThis.__libraryEnv = { QUIZMINT_RUNTIME: 'namecheap', DB: { prepare() { throw Error('D1 must not be used.'); } } };
const previous = Object.fromEntries(['DB_NAME','DB_USER','DB_PASSWORD'].map(key => [key, process.env[key]]));
Object.assign(process.env, { DB_NAME:'isolated_test', DB_USER:'test', DB_PASSWORD:'test-only' });
try {
  const plugin = { name:'library-test-runtime', setup(builder) {
    builder.onResolve({ filter:/^cloudflare:workers$/ }, () => ({ path:'env', namespace:'fixture' }));
    builder.onResolve({ filter:/^mysql2\/promise$/ }, () => ({ path:'mysql', namespace:'fixture' }));
    builder.onLoad({ filter:/.*/, namespace:'fixture' }, args => ({ contents:args.path==='env'?'export const env=globalThis.__libraryEnv':'export const createPool=()=>globalThis.__libraryPool', loader:'js' }));
  } };
  await build({ entryPoints:['app/api/library/route.ts','app/api/profile/route.ts','app/api/teacher/route.ts'], outdir:'.sites-runtime/namecheap-library-routes', outbase:'.', bundle:true, platform:'node', format:'esm', outExtension:{'.js':'.mjs'}, plugins:[plugin] });
  const library = await import('../.sites-runtime/namecheap-library-routes/app/api/library/route.mjs');
  const profile = await import('../.sites-runtime/namecheap-library-routes/app/api/profile/route.mjs');
  const teacher = await import('../.sites-runtime/namecheap-library-routes/app/api/teacher/route.mjs');
  const root='https://quizmint.test', tokenA='a'.repeat(64), tokenB='b'.repeat(64);
  for (const [id, token] of [['owner',tokenA],['other',tokenB]]) {
    sql.prepare('INSERT INTO creator_users VALUES(?,?,?,?,?)').run(id,id+'@example.test','hash','salt','now');
    sql.prepare('INSERT INTO creator_sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+60000);
  }
  const req=(path, method='GET', data, token=tokenA, origin=root)=>new Request(root+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Cookie:'__Host-quiz_session='+token}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const draft={title:'Maths Shapes',subject:'AI',description:'Geometry',timeLimitMinutes:5,questions:[{prompt:'2+2?',options:['1','2','3','4'],correct:3,explanation:'Four.'}]};
  const created=await teacher.POST(req('/api/teacher','POST',draft));assert.equal(created.status,201);const {id}=await created.json();
  assert.equal((await library.PATCH(req('/api/library','PATCH',{id,published:true,consent:true},tokenB))).status,404);
  assert.equal((await library.PATCH(req('/api/library','PATCH',{id,published:true}))).status,400);
  assert.equal((await library.PATCH(req('/api/library','PATCH',{id,published:true,consent:true}))).status,200);
  assert.equal((await (await library.GET(req('/api/library?search=MATH%20ai'))).json()).quizzes.length,1);
  assert.equal((await (await library.GET(req('/api/library?search=missing'))).json()).quizzes.length,0);
  assert.equal((await (await library.GET(req('/api/library?search=%25%25'))).json()).quizzes.length,0);
  assert.equal((await library.GET(req('/api/library?offset=-1'))).status,400);
  assert.equal((await library.POST(req('/api/library','POST',{id},''))).status,401);
  const copied=await library.POST(req('/api/library','POST',{id},tokenB));assert.equal(copied.status,201,await copied.clone().text());
  const copy=sql.prepare('SELECT * FROM quizzes WHERE id=?').get((await copied.json()).id);
  assert.equal(copy.owner_id,'other');assert.equal(copy.time_limit_minutes,5);
  assert.equal(sql.prepare('SELECT copies FROM public_quizzes WHERE id=?').get(id).copies,1);
  const before=sql.prepare('SELECT COUNT(*) n FROM quizzes').get().n;
  failCounter=true;assert.equal((await library.POST(req('/api/library','POST',{id},tokenB))).status,400);failCounter=false;
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM quizzes').get().n,before);
  assert.equal(sql.prepare('SELECT copies FROM public_quizzes WHERE id=?').get(id).copies,1);
  // Old snapshots can omit timeLimitMinutes and use a different property order.
  const legacy={questions:draft.questions,description:draft.description,subject:draft.subject,title:draft.title};
  sql.prepare('UPDATE public_quizzes SET quiz=? WHERE id=?').run(JSON.stringify(legacy),id);
  assert.equal((await library.POST(req('/api/library','POST',{id},tokenB))).status,201);
  assert.equal((await library.PATCH(req('/api/library','PATCH',{id,published:false}))).status,200);
  assert.equal((await library.GET(req('/api/library?id='+id))).status,404);
  assert.equal((await library.POST(req('/api/library','POST',{id},tokenB))).status,404);
  assert.equal((await profile.GET(req('/api/profile','GET',undefined,''))).status,401);
  assert.equal((await (await profile.GET(req('/api/profile'))).json()).completed,false);
  const data={name:'Test Teacher',teachingRole:'teacher',organisation:'School',subjects:'Maths',learnerGroup:'primary',country:'NG',bio:'Hello'};
  assert.equal((await profile.PUT(req('/api/profile','PUT',data,tokenA,'https://evil.test'))).status,403);
  assert.equal((await profile.PUT(req('/api/profile','PUT',{...data,name:''}))).status,400);
  assert.equal((await profile.PUT(req('/api/profile','PUT',data))).status,200);
  assert.equal((await profile.PUT(req('/api/profile','PUT',{...data,name:'Updated Teacher'}))).status,200);
  assert.equal((await (await profile.GET(req('/api/profile'))).json()).profile.name,'Updated Teacher');
  assert.equal((await (await profile.GET(req('/api/profile','GET',undefined,tokenB))).json()).completed,false);
  console.log('Namecheap library/profile route checks passed: publication consent, ownership, search, copies, timing, rollback, legacy snapshots, unpublishing and private profile persistence. No D1 access.');
} finally {
  for (const [key,value] of Object.entries(previous)) value===undefined?delete process.env[key]:process.env[key]=value;
  sql.close();
}
