import {nativeArenaStore} from '../../../lib/arena-store';
import {quizStore} from '../../../lib/quiz-store';
import {body,db,response,sameOrigin} from '../../../lib/server';
import {throttle} from '../../../lib/accounts';
import {arenaOwner,newCode} from '../../../lib/arena';
export const dynamic='force-dynamic';
export async function GET(req:Request){const owner=await arenaOwner(req);if(!owner)return response({error:'Sign in to host a competition.'},401);const native=await nativeArenaStore();if(native)return response({rooms:await native.list(owner.id)});const result=await db().prepare('SELECT code,title,mode,status,created,expires FROM arena_rooms WHERE owner_id=? ORDER BY created DESC LIMIT 50').bind(owner.id).all();return response({rooms:result.results});}
export async function POST(req:Request){if(!sameOrigin(req))return response({error:'Invalid origin.'},403);const owner=await arenaOwner(req);if(!owner)return response({error:'Sign in to host a competition.'},401);
 try{if(!await throttle('arena-create:'+owner.id,20))return response({error:'Too many rooms. Try again in 15 minutes.'},429);const x=await body(req);
 if(typeof x.quizId!=='string'||typeof x.title!=='string'||!x.title.trim()||x.title.length>120||!['individual','team'].includes(x.mode)||!Number.isInteger(x.seconds)||x.seconds<10||x.seconds>300)throw Error('Choose a quiz, title, mode and 10–300 seconds per question.');
 const q=await (await quizStore()).get(x.quizId);if(!q||(!owner.isAdmin&&q.owner_id!==owner.id))return response({error:'Quiz not found in your library.'},404);
 // Immutable question snapshot includes visuals and explanations, never returned before reveal.
 const now=Date.now();for(let attempt=0;attempt<5;attempt++){const code=newCode();const native=await nativeArenaStore();if(native){if(await native.create({code,ownerId:owner.id,title:x.title.trim(),quizId:q.id,questions:q.questions,mode:x.mode,seconds:x.seconds,now,expires:now+7*86400000}))return response({code},201);continue;}const inserted=await db().prepare("INSERT OR IGNORE INTO arena_rooms(code,owner_id,title,quiz_id,questions,mode,seconds,status,question_index,deadline,remaining,version,created,expires) VALUES(?,?,?,?,?,?,?,'lobby',-1,0,0,0,?,?)").bind(code,owner.id,x.title.trim(),q.id,q.questions,x.mode,x.seconds,now,now+7*86400000).run();if((inserted as any).meta?.changes||(inserted as any).changes)return response({code},201);}
 throw Error('Could not allocate a room code. Please retry.');
 }catch(e){console.error('Arena room creation failed',e instanceof Error?e.message:'Unknown error');return response({error:e instanceof Error?e.message:'Unable to create competition.'},400);}}
