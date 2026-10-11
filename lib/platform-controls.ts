import {db} from './server';
export const defaults={monthlyBudgetCents:5000,alertPercent:80,maxConcurrent:4,mintyGlobalLimit:240,aiPaused:false};
export async function platformConfig(){const row:any=await db().prepare("SELECT value FROM platform_settings WHERE id='controls'").first();return {...defaults,...(row?JSON.parse(row.value):{})} as typeof defaults;}
export async function usageSummary(){const month=new Date().toISOString().slice(0,7);const row:any=await db().prepare("SELECT COALESCE(SUM(cost_micro),0) cost,COALESCE(SUM(CASE WHEN status='reserved' THEN reserved_micro ELSE 0 END),0) reserved,COUNT(*) calls,COALESCE(SUM(CASE WHEN status IN ('failed','uncertain') THEN 1 ELSE 0 END),0) failures,COALESCE(AVG(CASE WHEN status IN ('completed','failed') THEN duration_ms END),0) latency FROM ai_usage WHERE month=?").bind(month).first();return {month,...row};}
// Reservations include a conservative estimate. Unknown/failed calls retain that
// estimate because a disconnected request may still have incurred provider cost.
export async function meteredAI(feature:string,userId:string|null,path:string,init:RequestInit,timeout:number){
 const config=await platformConfig();if(config.aiPaused)throw Error('AI is temporarily paused. Manual creation and saved quizzes remain available.');
 const isAudio=path==='audio/transcriptions';const payload=isAudio?null:JSON.parse(String(init.body));const model=isAudio?'whisper-1':payload.model;
 if(!isAudio&&model!=='gpt-4.1-mini')throw Error('This AI model needs a configured cost rate before it can be enabled.');
 const inputEstimate=payload?.input?.some?.((i:any)=>i.content?.some?.((c:any)=>c.type==='input_file'))?1047576:new TextEncoder().encode(String(init.body)).length+1024;
 const reserve=isAudio?1000000:Math.ceil(inputEstimate*.4+Number(payload.max_output_tokens||32768)*1.6);
 const id=crypto.randomUUID(),now=Date.now(),month=new Date(now).toISOString().slice(0,7);
 await db().prepare('INSERT INTO ai_budgets(month) VALUES(?) ON CONFLICT DO NOTHING').bind(month).run();
 await db().batch([
  db().prepare("UPDATE ai_budgets SET cost_micro=cost_micro+COALESCE((SELECT SUM(reserved_micro) FROM ai_usage WHERE status='reserved' AND expires<? AND ai_usage.month=ai_budgets.month),0),reserved_micro=MAX(0,reserved_micro-COALESCE((SELECT SUM(reserved_micro) FROM ai_usage WHERE status='reserved' AND expires<? AND ai_usage.month=ai_budgets.month),0)) WHERE month IN (SELECT month FROM ai_usage WHERE status='reserved' AND expires<?)").bind(now,now,now),
  db().prepare("UPDATE ai_usage SET status='uncertain',cost_micro=reserved_micro WHERE status='reserved' AND expires<?").bind(now),
  db().prepare("INSERT INTO ai_usage(id,month,feature,model,user_id,reserved_micro,status,created,expires) SELECT ?,?,?,?,?,?,'reserved',?,? WHERE (SELECT cost_micro+reserved_micro FROM ai_budgets WHERE month=?)+?<=?").bind(id,month,feature,model,userId,reserve,now,now+timeout+60000,month,reserve,config.monthlyBudgetCents*10000),
  db().prepare("UPDATE ai_budgets SET reserved_micro=reserved_micro+? WHERE month=? AND EXISTS(SELECT 1 FROM ai_usage WHERE id=? AND status='reserved')").bind(reserve,month,id)
 ]);
 if(!await db().prepare('SELECT id FROM ai_usage WHERE id=?').bind(id).first())throw Error('The platform AI budget is currently fully used or reserved. Please try later; question credits are not spent.');
 try{
  const {env}=await import('cloudflare:workers');
  const r=await fetch('https://api.openai.com/v1/'+path,{...init,headers:{Authorization:'Bearer '+(env as any).OPENAI_API_KEY,...init.headers},signal:AbortSignal.timeout(timeout)});
  const x:any=await r.json();if(!r.ok)throw Error('AI service is unavailable. Please try again.');
  const input=Number(x.usage?.input_tokens||0),output=Number(x.usage?.output_tokens||0);
  const measured=isAudio?Number.isFinite(x.duration)&&x.duration>=0:Number.isInteger(x.usage?.input_tokens)&&x.usage.input_tokens>=0&&Number.isInteger(x.usage?.output_tokens)&&x.usage.output_tokens>=0;
  const cached=Math.max(0,Math.min(input,Number(x.usage?.input_tokens_details?.cached_tokens)||0));
  const cost=measured?Math.ceil(isAudio?x.duration*100:(input-cached)*.4+cached*.1+output*1.6):reserve;
  await db().batch([db().prepare("UPDATE ai_budgets SET cost_micro=cost_micro+?,reserved_micro=MAX(0,reserved_micro-?) WHERE month=? AND EXISTS(SELECT 1 FROM ai_usage WHERE id=? AND status='reserved')").bind(cost,reserve,month,id),db().prepare("UPDATE ai_usage SET status='completed',cost_micro=?,input_tokens=?,output_tokens=?,duration_ms=? WHERE id=? AND status='reserved'").bind(cost,input,output,Date.now()-now,id)]);
  return x;
 }catch(e){await db().batch([db().prepare("UPDATE ai_budgets SET cost_micro=cost_micro+?,reserved_micro=MAX(0,reserved_micro-?) WHERE month=? AND EXISTS(SELECT 1 FROM ai_usage WHERE id=? AND status='reserved')").bind(reserve,reserve,month,id),db().prepare("UPDATE ai_usage SET status='failed',cost_micro=reserved_micro,duration_ms=? WHERE id=? AND status='reserved'").bind(Date.now()-now,id)]);throw e;}
}
export async function queueTicket(userId:string,id:string,start=false){
 const now=Date.now(),config=await platformConfig();if(config.aiPaused)throw Error('AI is temporarily paused.');
 await db().prepare("UPDATE ai_queue SET status='expired' WHERE status IN ('queued','ready','running') AND expires<=?").bind(now).run();
 await db().prepare("INSERT INTO ai_queue(id,user_id,status,created,expires) SELECT ?,?,'queued',?,? WHERE NOT EXISTS(SELECT 1 FROM ai_queue WHERE user_id=? AND status IN ('queued','ready','running')) AND (SELECT COUNT(*) FROM ai_queue WHERE status='queued')<1000 ON CONFLICT(id) DO NOTHING").bind(id,userId,now,now+90000,userId).run();
 let row:any=await db().prepare('SELECT * FROM ai_queue WHERE id=? AND user_id=?').bind(id,userId).first();if(!row)throw Error('Another request is already queued, or the queue is full.');
 if(['done','expired'].includes(row.status))throw Error('This queue request has ended. Start a new request.');
 await db().prepare("UPDATE ai_queue SET expires=? WHERE id=? AND user_id=? AND status='queued'").bind(now+90000,id,userId).run();
 await db().prepare("UPDATE ai_queue SET status='ready',expires=? WHERE id=? AND user_id=? AND status='queued' AND id=(SELECT id FROM ai_queue WHERE status='queued' ORDER BY created,id LIMIT 1) AND (SELECT COUNT(*) FROM ai_queue WHERE status IN ('ready','running'))<?").bind(now+120000,id,userId,config.maxConcurrent).run();
 if(start)await db().prepare("UPDATE ai_queue SET status='running',expires=? WHERE id=? AND user_id=? AND status='ready'").bind(now+480000,id,userId).run();
 row=await db().prepare('SELECT * FROM ai_queue WHERE id=? AND user_id=?').bind(id,userId).first();
 const position:any=await db().prepare("SELECT COUNT(*) n FROM ai_queue WHERE status='queued' AND (created<? OR (created=? AND id<=?))").bind(row.created,row.created,id).first();
 return {status:row.status,position:position.n,ready:row.status==='ready'||(start&&row.status==='running')};
}
export async function releaseTicket(userId:string,id:string){await db().prepare("UPDATE ai_queue SET status='done' WHERE id=? AND user_id=?").bind(id,userId).run();}

export async function aiAvailability(){const config=await platformConfig();const row:any=await db().prepare('SELECT cost_micro+reserved_micro total FROM ai_budgets WHERE month=?').bind(new Date().toISOString().slice(0,7)).first();return !config.aiPaused&&(row?.total||0)<config.monthlyBudgetCents*10000;}
