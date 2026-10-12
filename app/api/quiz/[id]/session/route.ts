import {body,db,response,sameOrigin} from '../../../../../lib/server';
import {digest,emailAddress,throttle} from '../../../../../lib/accounts';
import {type Question} from '../../../../../lib/quiz';
export const dynamic='force-dynamic';
const publicQuiz=(q:any)=>({title:q.title,subject:q.subject,description:q.description,timeLimitMinutes:q.timeLimitMinutes,questions:q.questions.map((x:Question)=>({prompt:x.prompt,options:x.options,...(x.image?{image:x.image}:{}),...(x.diagram?{diagram:x.diagram}:{})}))});
function validAnswers(value:unknown,count:number):number[]{if(!Array.isArray(value)||value.length!==count||value.some(a=>!Number.isInteger(a)||a< -1||a>3))throw Error('Check your answers and retry.');return value;}
function view(row:any){return {quiz:publicQuiz(JSON.parse(row.snapshot)),student:row.student,answers:JSON.parse(row.answers),step:row.step,revision:row.revision,deadline:row.deadline,serverNow:Date.now(),...(row.result?{result:JSON.parse(row.result)}:{})};}
async function find(id:string,hash:string){return db().prepare('SELECT s.* FROM quiz_sessions s JOIN quizzes q ON q.id=s.quiz_id WHERE s.quiz_id=? AND s.token_hash=? AND q.active=1').bind(id,hash).first<any>();}
async function finish(row:any,incoming?:unknown){
 for(let tries=0;tries<4;tries++){
  if(row.result)return row;
  const now=Date.now(),expired=row.deadline>0&&now>=row.deadline,q=JSON.parse(row.snapshot),answers=expired?JSON.parse(row.answers):validAnswers(incoming,q.questions.length);
  if(!expired&&answers.some((a:number)=>a<0))throw Error('Answer every question before submitting.');
  const feedback=q.questions.map((question:Question,i:number)=>({...question,selected:answers[i],isCorrect:question.correct===answers[i]}));
  const result={score:feedback.filter((x:any)=>x.isCorrect).length,total:feedback.length,feedback,student:row.student,created:new Date(now).toISOString(),timedOut:expired};
  const encoded=JSON.stringify(result);
  // The revision guards against concurrent autosaves. The database clock also
  // prevents an in-flight manual submission accepting new answers after expiry.
  await db().batch([
   db().prepare(`UPDATE quiz_sessions SET result=?,answers=?,updated=?,revision=revision+1 WHERE id=? AND revision=? AND result IS NULL AND EXISTS(SELECT 1 FROM quizzes WHERE id=quiz_id AND active=1) ${expired?'':"AND (deadline=0 OR deadline>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))"}`).bind(encoded,JSON.stringify(answers),now,row.id,row.revision),
   db().prepare('INSERT OR IGNORE INTO attempts(id,quiz_id,student,score,total,result,created) SELECT id,quiz_id,student,json_extract(result,\'$.score\'),json_extract(result,\'$.total\'),result,json_extract(result,\'$.created\') FROM quiz_sessions WHERE id=? AND result IS NOT NULL').bind(row.id),
  ]);
  const latest=await find(row.quiz_id,row.token_hash);if(!latest)throw Error('This quiz is unavailable or closed.');if(latest.result)return latest;row=latest;
 }
 throw Error('Progress changed in another tab. Reload before submitting.');
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return response({error:'Invalid origin.'},403);
 try{
  const {id}=await params,x=await body(req);
  if(x.action==='start'){
   if(!await throttle('quiz-start:'+id+':'+(req.headers.get('cf-connecting-ip')||'unknown'),300))return response({error:'Too many starts. Please wait before trying again.'},429);
   const q=await db().prepare('SELECT * FROM quizzes WHERE id=? AND active=1').bind(id).first<any>();if(!q)return response({error:'This quiz is unavailable or closed.'},410);
   const student=emailAddress(x.student),questions=JSON.parse(q.questions),now=Date.now(),token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),hash=await digest(token),runId=crypto.randomUUID();
   const snapshot={title:q.title,subject:q.subject,description:q.description,timeLimitMinutes:q.time_limit_minutes||0,questions},answers=Array(questions.length).fill(-1),deadline=snapshot.timeLimitMinutes?now+snapshot.timeLimitMinutes*60000:0;
   await db().prepare('INSERT INTO quiz_sessions(id,quiz_id,token_hash,student,snapshot,answers,deadline,started,updated) VALUES(?,?,?,?,?,?,?,?,?)').bind(runId,id,hash,student,JSON.stringify(snapshot),JSON.stringify(answers),deadline,now,now).run();
   return response({...view({snapshot:JSON.stringify(snapshot),student,answers:JSON.stringify(answers),step:0,revision:0,deadline}),token},201);
  }
  if(typeof x.token!=='string'||!/^[a-f0-9]{64}$/.test(x.token))return response({error:'Use the private resume link or the browser where you started.'},401);
  const hash=await digest(x.token);let row=await find(id,hash);if(!row)return response({error:'Saved attempt not found, or the creator has closed or deleted this quiz.'},404);
  if(!['resume','save','submit'].includes(x.action))throw Error('Choose a valid action.');
  if(row.result)return response(view(row));
  if(row.deadline>0&&Date.now()>=row.deadline)return response(view(await finish(row)));
  if(x.action==='resume')return response(view(row));
  if(x.action==='submit')return response(view(await finish(row,x.answers)));
  const q=JSON.parse(row.snapshot),answers=validAnswers(x.answers,q.questions.length);
  if(!Number.isInteger(x.step)||x.step<0||x.step>=q.questions.length||!Number.isInteger(x.revision)||x.revision<0)throw Error('Invalid progress. Reload the quiz.');
  await db().prepare("UPDATE quiz_sessions SET answers=?,step=?,updated=?,revision=revision+1 WHERE id=? AND revision=? AND result IS NULL AND (deadline=0 OR deadline>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) AND EXISTS(SELECT 1 FROM quizzes WHERE id=quiz_id AND active=1)").bind(JSON.stringify(answers),x.step,Date.now(),row.id,x.revision).run();
  const saved=await find(id,hash);if(!saved)return response({error:'This quiz is unavailable or closed.'},410);
  if(saved.result)return response(view(saved));
  if(saved.deadline>0&&Date.now()>=saved.deadline)return response(view(await finish(saved)));
  if(saved.revision!==x.revision+1||saved.answers!==JSON.stringify(answers)||saved.step!==x.step)return response({error:'Progress changed in another tab. Reload to use the latest saved answers.',conflict:true},409);
  return response({revision:saved.revision,serverNow:Date.now(),deadline:saved.deadline});
 }catch(e){return response({error:e instanceof Error?e.message:'Unable to save this attempt. Please retry.'},400);}
}
