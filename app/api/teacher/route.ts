import {quizStore} from '../../../lib/quiz-store';
import {admin,body,response,sameOrigin} from '../../../lib/server';
import {creator} from '../../../lib/accounts';
import {validateQuiz} from '../../../lib/quiz';
import {verifyQuestionImages} from '../../../lib/question-images';
export const dynamic='force-dynamic';
async function access(req:Request){if(new URL(req.url).pathname==='/api/admin')return await admin(req)?{id:null,isAdmin:true}:null;return await creator(req.headers.get('cookie')).then(u=>u?{id:u.id,isAdmin:false}:null);}
async function owns(req:Request,id:string){const user=await access(req);if(!user)return false;return (await quizStore()).owns(id,user);}
export async function GET(req:Request){const user=await access(req);if(!user)return response({error:'Sign in to your creator account.'},401);
 const id=new URL(req.url).searchParams.get('results');if(id&&!await owns(req,id))return response({error:'Quiz not found.'},404);
 const url=new URL(req.url),offset=Number(url.searchParams.get('offset')||0),resultOffset=Number(url.searchParams.get('resultOffset')||0);if(!Number.isInteger(offset)||offset<0||offset>1000000||!Number.isInteger(resultOffset)||resultOffset<0||resultOffset>10000000)return response({error:'Invalid page.'},400);
 const store=await quizStore();
 const quizzes=await store.list(user,offset);
 const attempts=id?await store.attempts(id,resultOffset):[];
 return response({quizzes:quizzes.slice(0,25).map((q:any)=>({...q,questions:JSON.parse(q.questions)})),attempts:attempts.slice(0,100),nextOffset:quizzes.length>25?offset+25:null,nextResultOffset:attempts.length>100?resultOffset+100:null,offset,resultOffset});}

export async function POST(req:Request){if(!sameOrigin(req))return response({error:'Invalid origin.'},403);const user=await access(req);if(!user)return response({error:'Creator account required.'},401);try{const q=validateQuiz(await body(req));await verifyQuestionImages(q.questions,user.isAdmin?'admin:'+req.headers.get('oai-authenticated-user-id'):user.id!);const id=crypto.randomUUID().replaceAll('-','').slice(0,16);await (await quizStore()).create({id,quiz:q,created:new Date().toISOString(),ownerId:user.id});return response({id},201);}catch(e){return response({error:e instanceof Error?e.message:'Unable to create quiz.'},400);}}
export async function PATCH(req:Request){if(!sameOrigin(req)||!await access(req))return response({error:'Creator access required.'},403);try{const x=await body(req);if(typeof x.id!=='string'||typeof x.active!=='boolean')throw Error('Invalid quiz.');if(!await owns(req,x.id))return response({error:'Quiz not found.'},404);await (await quizStore()).setActive(x.id,x.active,(await access(req))!);return response({ok:true});}catch{return response({error:'Unable to update quiz.'},400);}}
export async function DELETE(req:Request){if(!sameOrigin(req)||!await access(req))return response({error:'Creator access required.'},403);const id=new URL(req.url).searchParams.get('id');if(!id||!await owns(req,id))return response({error:'Quiz not found.'},404);if(!await (await quizStore()).remove(id,(await access(req))!))return response({error:'Quiz not found.'},404);return response({ok:true});}
