import {db,response,body,sameOrigin} from '../../../../lib/server';
import {grade,Question} from '../../../../lib/quiz';
import {emailAddress} from '../../../../lib/accounts';
import {sample} from '../../../../lib/sample';
export const dynamic='force-dynamic';
async function quiz(id:string){return await db().prepare('SELECT * FROM quizzes WHERE id=?').bind(id).first<any>();}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;if(id==='demo')return response({...sample,id,questions:sample.questions.map(q=>({prompt:q.prompt,options:q.options}))});const q=await quiz(id);if(!q)return response({error:'This quiz could not be found.'},404);if(!q.active)return response({error:'This quiz is closed. Please contact your teacher.'},410);return response({id:q.id,title:q.title,subject:q.subject,description:q.description,questions:JSON.parse(q.questions).map((x:Question)=>({prompt:x.prompt,options:x.options,...(x.image?{image:x.image}:{}),...(x.diagram?{diagram:x.diagram}:{})}))});}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(req))return response({error:'Invalid origin.'},403);
 try{const {id}=await params;if(id==='demo'){const x=await body(req);return response({...grade(sample.questions,x.answers),student:emailAddress(x.student),created:new Date().toISOString(),demo:true});}const q=await quiz(id);if(!q||!q.active)return response({error:'This quiz is unavailable or closed.'},410);
 const x=await body(req);const email=emailAddress(x.student);if(typeof x.attemptId!=='string'||!/^[a-f0-9-]{36}$/.test(x.attemptId))throw new Error('Invalid submission.');
 const previous=await db().prepare('SELECT result FROM attempts WHERE id=? AND quiz_id=?').bind(x.attemptId,id).first<any>();if(previous)return response(JSON.parse(previous.result));
 const result={...grade(JSON.parse(q.questions),x.answers),student:email,created:new Date().toISOString()};
 await db().prepare('INSERT OR IGNORE INTO attempts(id,quiz_id,student,score,total,result,created) VALUES(?,?,?,?,?,?,?)').bind(x.attemptId,id,result.student,result.score,result.total,JSON.stringify(result),result.created).run();
 const saved=await db().prepare('SELECT result FROM attempts WHERE id=? AND quiz_id=?').bind(x.attemptId,id).first<any>();if(!saved)throw new Error('Please retry your submission.');return response(JSON.parse(saved.result));
 }catch(e){return response({error:e instanceof Error?e.message:'Submission failed. Please retry.'},400);}
}
