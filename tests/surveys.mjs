import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const namecheap=process.argv.includes('--namecheap');
if(namecheap&&!/^quizmint_survey_test(?:_[a-z0-9]+)*$/.test(process.env.DB_NAME||''))throw Error('Select a disposable quizmint_survey_test database.');
const sql=namecheap?null:new DatabaseSync(':memory:');
if(sql)sql.exec(readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync('drizzle/'+f,'utf8')).join('\n').replaceAll('--> statement-breakpoint',''));
class Statement{constructor(query){this.query=query;this.values=[];}bind(...v){this.values=v;return this;}async first(){return sql.prepare(this.query).get(...this.values)||null;}async all(){return {results:sql.prepare(this.query).all(...this.values)};}async run(){return sql.prepare(this.query).run(...this.values);}}
globalThis.__surveyEnv=namecheap?{QUIZMINT_RUNTIME:'namecheap',APP_URL:'https://survey.test',DB:{prepare(){throw Error('D1 must not be used on Namecheap.');}}}:{DB:{prepare:q=>new Statement(q),batch:async qs=>{sql.exec('BEGIN');try{const out=qs.map(q=>sql.prepare(q.query).run(...q.values));sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
const plugin={name:'env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__surveyEnv',loader:'js'}));}};
const outdir=namecheap?'.sites-runtime/namecheap-survey-tests':'.sites-runtime/survey-tests';
await build({entryPoints:['lib/survey.ts','app/api/ai/generate/route.ts','app/api/account/route.ts','app/api/surveys/route.ts','app/api/surveys/[id]/route.ts'],outbase:'.',outdir,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},external:['mysql2/promise'],plugins:[plugin]});
const account=await import('../'+outdir+'/app/api/account/route.mjs'),collection=await import('../'+outdir+'/app/api/surveys/route.mjs'),item=await import('../'+outdir+'/app/api/surveys/[id]/route.mjs');
const {surveyCsv}=await import('../'+outdir+'/lib/survey.mjs');
const root='https://survey.test',req=(path,method='GET',data,headers={})=>new Request(root+path,{method,headers:{Origin:root,'Content-Type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:{})});
async function register(email){const r=await account.POST(req('/api/account','POST',{action:'register',email,password:'a-secure-password-123'}));assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
const runId=crypto.randomUUID();
const owner=await register('owner-'+runId+'@example.test'),other=await register('other-'+runId+'@example.test');
const survey={title:'Feedback',description:'',closingMessage:'Thanks',identifierLabel:'',questions:[{prompt:'Use this?',type:'single',required:true,options:['Yes','No'],branches:[null,2]},{prompt:'Why?',type:'short',required:true,options:[],branches:[]},{prompt:'Rating',type:'rating',required:false,options:[],branches:[]}]};
const create=await collection.POST(req('/api/surveys','POST',survey,{cookie:owner}));assert.equal(create.status,201);const {id}=await create.json(),params={params:Promise.resolve({id})};
assert.equal((await collection.POST(req('/api/surveys','POST',{...survey,questions:[{...survey.questions[0],branches:[0,null]},...survey.questions.slice(1)]},{cookie:owner}))).status,400,'Backward branches are rejected');
assert.equal((await item.GET(req('/api/surveys/'+id+'?owner=1','GET',null,{cookie:other}),params)).status,404);
assert.equal((await item.GET(req('/api/surveys/'+id),params)).status,200);
assert.equal((await collection.GET(req('/api/surveys','GET',null,{cookie:owner})).then(r=>r.json())).surveys[0].id,id);
assert.deepEqual((await collection.GET(req('/api/surveys','GET',null,{cookie:other})).then(r=>r.json())).surveys,[]);
assert.equal((await item.PATCH(req('/api/surveys/'+id,'PATCH',{active:false},{cookie:other}),params)).status,404);
assert.equal((await item.PATCH(req('/api/surveys/'+id,'PATCH',{survey},{cookie:other}),params)).status,404);
const updateBeforeResponse={...survey,questions:[...survey.questions.slice(0,2),{...survey.questions[2],prompt:'Updated rating'}]};
assert.equal((await item.PATCH(req('/api/surveys/'+id,'PATCH',{survey:updateBeforeResponse},{cookie:owner}),params)).status,200);
assert.equal((await item.PATCH(req('/api/surveys/'+id,'PATCH',{survey},{cookie:owner}),params)).status,200);
const submit=data=>item.POST(req('/api/surveys/'+id,'POST',{responseId:crypto.randomUUID(),...data}),params);
assert.equal((await submit({identifier:'',answers:[1,'hidden',null]})).status,400,'Cannot submit unseen answers');
assert.equal((await submit({identifier:'',answers:[0,null,null]})).status,400,'Required visible answer enforced');
assert.equal((await submit({identifier:'',answers:[1,null,null]})).status,200,'A branch may skip a required question');
assert.equal((await submit({identifier:'',answers:[0,'Because it helps',3]})).status,200);
const retryId=crypto.randomUUID(),retry={responseId:retryId,identifier:'',answers:[1,null,null]};assert.equal((await item.POST(req('/api/surveys/'+id,'POST',retry),params)).status,200);assert.equal((await item.POST(req('/api/surveys/'+id,'POST',retry),params)).status,200);const data=await (await item.GET(req('/api/surveys/'+id+'?owner=1','GET',null,{cookie:owner}),params)).json();
assert.equal(data.count,3,'Retries do not create duplicate responses');
assert.ok(data.responses.every(row=>row.identifier===null));
assert.deepEqual(data.responses.find(row=>row.answers[0]===1).seen,[0,2]);
assert.deepEqual(data.responses.find(row=>row.answers[0]===0).seen,[0,1,2]);
const csv=surveyCsv(data.survey,data.responses);
assert.match(csv,/"Submitted","Use this\?","Why\?","Rating"/);
assert.match(csv,/"No","\[Not shown\]","\[Skipped\]"/);
assert.match(csv,/"Yes","Because it helps","4"/);

assert.equal((await item.PATCH(req('/api/surveys/'+id,'PATCH',{survey:{...survey,questions:[{...survey.questions[0],prompt:'Changed'},...survey.questions.slice(1)]}},{cookie:owner}),params)).status,409,'Questions lock after response');
assert.equal((await item.PATCH(req('/api/surveys/'+id,'PATCH',{survey:{...survey,title:'Updated'}},{cookie:owner}),params)).status,200);
const branded={...survey,title:'Updated',logo:'data:image/png;base64,aGVsbG8=',cover:'data:image/webp;base64,aGVsbG8=',accent:'#123456'};
assert.equal((await item.PATCH(req('/api/surveys/'+id,'PATCH',{survey:branded},{cookie:owner}),params)).status,200,'Branding remains editable after responses');
const publicSurvey=await (await item.GET(req('/api/surveys/'+id),params)).json();assert.equal(publicSurvey.survey.logo,branded.logo);assert.equal(publicSurvey.survey.cover,branded.cover);assert.equal(publicSurvey.survey.accent,branded.accent);
assert.equal((await item.PATCH(req('/api/surveys/'+id,'PATCH',{survey:{...branded,logo:'data:image/svg+xml;base64,aGVsbG8='}},{cookie:owner}),params)).status,400,'Unsafe image formats are rejected');
assert.equal((await item.PATCH(req('/api/surveys/'+id,'PATCH',{survey:{...branded,accent:'red'}},{cookie:owner}),params)).status,400,'Invalid colours are rejected');
assert.equal((await item.PATCH(req('/api/surveys/'+id,'PATCH',{active:false},{cookie:owner}),params)).status,200);assert.equal((await submit({identifier:'',answers:[1,null,null]})).status,410);
assert.equal((await item.DELETE(req('/api/surveys/'+id,'DELETE',null,{cookie:other}),params)).status,404);
assert.equal((await item.DELETE(req('/api/surveys/'+id,'DELETE',null,{cookie:owner}),params)).status,200);assert.equal((await item.GET(req('/api/surveys/'+id),params)).status,404);
if(sql)assert.equal(sql.prepare('SELECT COUNT(*) n FROM survey_responses').get().n,0);
const identified={...survey,identifierLabel:'Student ID'};const r=await collection.POST(req('/api/surveys','POST',identified,{cookie:owner}));const id2=(await r.json()).id,params2={params:Promise.resolve({id:id2})};assert.equal((await item.POST(req('/api/surveys/'+id2,'POST',{responseId:crypto.randomUUID(),identifier:'',answers:[1,null,null]}),params2)).status,400);assert.equal((await item.POST(req('/api/surveys/'+id2,'POST',{responseId:crypto.randomUUID(),identifier:'A123',answers:[1,null,null]}),params2)).status,200);
const identifiedResults=await (await item.GET(req('/api/surveys/'+id2+'?owner=1','GET',null,{cookie:owner}),params2)).json();
assert.equal(identifiedResults.responses[0].identifier,'A123');
assert.match(surveyCsv(identifiedResults.survey,identifiedResults.responses),/"Student ID"/);
assert.match(surveyCsv(identifiedResults.survey,identifiedResults.responses),/"A123"/);

assert.equal((await item.DELETE(req('/api/surveys/'+id2,'DELETE',null,{cookie:owner}),params2)).status,200);
globalThis.__surveyEnv.OPENAI_API_KEY='fixture-only';
const generate=await import('../'+outdir+'/app/api/ai/generate/route.mjs');
const actualFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>{
 assert.equal(String(url),'https://api.openai.com/v1/responses');
 assert.match(JSON.parse(options.body).instructions,/no correct answers/i);
 return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({
  title:'AI feedback',subject:'Training',description:'',questions:[{prompt:'How useful was the training?',options:['Very useful','Somewhat useful','Slightly useful','Not useful'],correct:0,explanation:'Survey question; no correct answer.'}],
 })}]}]});
};
const form=new FormData();
for(const [key,value] of Object.entries({requestId:crypto.randomUUID(),sourceType:'topic',source:'Collect feedback about the recent training programme.',count:'1',kind:'survey'}))form.set(key,value);
const ai=await generate.POST(new Request(root+'/api/ai/generate',{method:'POST',headers:{Origin:root,cookie:owner},body:form}));
globalThis.fetch=actualFetch;
assert.equal(ai.status,200,await ai.clone().text());
const {quiz}=await ai.json();
const aiCreated=await collection.POST(req('/api/surveys','POST',{...survey,title:quiz.title,questions:quiz.questions.map(q=>({prompt:q.prompt,type:'single',required:true,options:q.options,branches:q.options.map(()=>null)}))},{cookie:owner}));
assert.equal(aiCreated.status,201);
const aiId=(await aiCreated.json()).id,aiParams={params:Promise.resolve({id:aiId})};
assert.equal((await item.GET(req('/api/surveys/'+aiId),aiParams)).status,200);
assert.equal((await item.DELETE(req('/api/surveys/'+aiId,'DELETE',null,{cookie:owner}),aiParams)).status,200);
sql?.close();
console.log('Passed '+(namecheap?'Namecheap SQL':'Cloudflare')+' surveys: ownership, edits, guest responses, branches, required fields, branding, AI drafting, results, CSV, locking and deletion.');
if(namecheap)process.exit(0); // Bundled route pools otherwise keep their idle sockets open.
