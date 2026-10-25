import {quizSessionStore} from '../../../../../lib/quiz-session-store';
import {quizStore} from '../../../../../lib/quiz-store';
import {body,response,sameOrigin} from '../../../../../lib/server';
import {digest,emailAddress,throttle} from '../../../../../lib/accounts';
import {type Question} from '../../../../../lib/quiz';
export const dynamic='force-dynamic';
const publicQuiz=(q:any)=>({title:q.title,subject:q.subject,description:q.description,timeLimitMinutes:q.timeLimitMinutes,questions:q.questions.map((x:Question)=>({prompt:x.prompt,options:x.options,...(x.image?{image:x.image}:{}),...(x.diagram?{diagram:x.diagram}:{})}))});
function validAnswers(value:unknown,count:number):number[]{if(!Array.isArray(value)||value.length!==count||value.some(a=>!Number.isInteger(a)||a< -1||a>3))throw Error('Check your answers and retry.');return value;}
function view(row:any){return {quiz:publicQuiz(JSON.parse(row.snapshot)),student:row.student,answers:JSON.parse(row.answers),step:row.step,revision:row.revision,deadline:row.deadline,serverNow:Date.now(),...(row.result?{result:JSON.parse(row.result)}:{})};}
async function find(id:string,hash:string){return (await quizSessionStore()).find(id,hash);}
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
  await (await quizSessionStore()).finalize({id:row.id,quizId:row.quiz_id,revision:row.revision,result:encoded,answers:JSON.stringify(answers),now,expired});
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
   const q=await (await quizStore()).get(id);if(!q||!q.active)return response({error:'This quiz is unavailable or closed.'},410);
   const student=emailAddress(x.student),questions=JSON.parse(q.questions),now=Date.now(),token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),hash=await digest(token),runId=crypto.randomUUID();
   const snapshot={title:q.title,subject:q.subject,description:q.description,timeLimitMinutes:q.time_limit_minutes||0,questions},answers=Array(questions.length).fill(-1),deadline=snapshot.timeLimitMinutes?now+snapshot.timeLimitMinutes*60000:0;
   if(!await (await quizSessionStore()).start({id:runId,quizId:id,tokenHash:hash,student,snapshot:JSON.stringify(snapshot),answers:JSON.stringify(answers),deadline,now}))return response({error:'This quiz is unavailable or closed.'},410);
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
  await (await quizSessionStore()).save({id:row.id,quizId:id,revision:x.revision,answers:JSON.stringify(answers),step:x.step,now:Date.now()});
  const saved=await find(id,hash);if(!saved)return response({error:'This quiz is unavailable or closed.'},410);
  if(saved.result)return response(view(saved));
  if(saved.deadline>0&&Date.now()>=saved.deadline)return response(view(await finish(saved)));
  if(saved.revision!==x.revision+1||saved.answers!==JSON.stringify(answers)||saved.step!==x.step)return response({error:'Progress changed in another tab. Reload to use the latest saved answers.',conflict:true},409);
  return response({revision:saved.revision,serverNow:Date.now(),deadline:saved.deadline});
 }catch(e){return response({error:e instanceof Error?e.message:'Unable to save this attempt. Please retry.'},400);}
}
