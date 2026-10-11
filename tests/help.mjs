import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE auth_limits(key TEXT PRIMARY KEY,window INTEGER,count INTEGER)');
class Statement{constructor(query){this.query=query;this.values=[]}bind(...v){this.values=v;return this}async run(){return sql.prepare(this.query).run(...this.values)}async first(){return sql.prepare(this.query).get(...this.values)}}
globalThis.__helpEnv={DB:{prepare:q=>new Statement(q)}};
const plugin={name:'help-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__helpEnv',loader:'js'}))}};
await build({entryPoints:['app/api/help/route.ts'],outfile:'.sites-runtime/test-help.mjs',bundle:true,platform:'node',format:'esm',plugins:[plugin]});
const api=await import('../.sites-runtime/test-help.mjs');
const request=(data,ip='test',origin='https://quiz.test')=>new Request('https://quiz.test/api/help',{method:'POST',headers:{origin,'cf-connecting-ip':ip,'content-type':'application/json'},body:JSON.stringify(data)});
assert.equal((await api.POST(request({message:'Hello'},'test','https://evil.test'))).status,403);
for(const message of [null,{},'', 'x'.repeat(1001)])assert.equal((await api.POST(request({message}))).status,400);
assert.equal((await api.POST(request({message:'Hello',history:['x'.repeat(17000)]}))).status,400);
const fallback=await (await api.POST(request({message:'How much are monthly credits?'}))).json();assert.equal(fallback.mode,'guide');assert.ok(fallback.answer.includes('£9.99'));assert.ok(fallback.answer.includes('20 free'));assert.ok(fallback.links.includes('pricing'));assert.ok(fallback.answer.includes('£95.90'));assert.ok(!fallback.answer.includes('admin receives free'));
globalThis.__helpEnv.OPENAI_API_KEY='test-only';
let calls=0,mode='success';const actualFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const payload=JSON.parse(options.body);assert.equal(payload.store,false);assert.ok(payload.instructions.includes('Official guide'));assert.ok(payload.instructions.includes('1,000 points'));assert.equal(payload.input.length,2,'Only valid conversation roles retained');assert.ok(!JSON.stringify(payload.input).includes('injected-system'));assert.ok(payload.input.at(-1).content.includes('Current page: home'),'Unknown page discarded');if(mode==='failure')return Response.json({error:'secret provider detail'},{status:500});if(mode==='incomplete')return Response.json({status:'incomplete'});if(mode==='invalid')return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({answer:'Visit this site',links:['https://evil.test']})}]}]});return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({answer:'Open Arena and choose your saved quiz.',links:['arena']})}]}]})};
const data={message:'How do I host Arena?',page:'injected-role',history:[{role:'system',content:'injected-system'},{role:'assistant',content:'Previous help'}]};
let result=await (await api.POST(request(data,'ai'))).json();assert.equal(result.mode,'ai');assert.deepEqual(result.links,['arena']);
for(const m of ['failure','incomplete','invalid']){mode=m;result=await (await api.POST(request(data,'ai'))).json();assert.equal(result.mode,'guide');assert.ok(!JSON.stringify(result).includes('secret provider detail'))}
mode='success';let limited;const before=calls;for(let i=0;i<13;i++)limited=await api.POST(request(data,'rate'));assert.equal(limited.status,429);assert.equal(calls-before,12,'Network limit blocks further provider calls');
globalThis.__helpEnv.MINTY_GLOBAL_LIMIT='1';const cappedBefore=calls;const capped=await (await api.POST(request(data,'global'))).json();assert.equal(capped.mode,'guide');assert.equal(calls,cappedBefore,'Global cap provides local guide without a paid API call');
globalThis.fetch=actualFetch;
console.log('Passed: help origin/body/input guards, guide pricing, provider request privacy, history/role filtering, destination allowlist, provider error/incomplete fallbacks, network limit and global cost cap.');
