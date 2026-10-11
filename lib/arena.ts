import {admin,db} from './server';
import {creator,digest} from './accounts';
import type {Question} from './quiz';
export type ArenaStatus='lobby'|'question'|'paused'|'reveal'|'finished';
export type ArenaRoom={code:string;owner_id:string;title:string;quiz_id:string;questions:string;mode:'individual'|'team';seconds:number;status:ArenaStatus;question_index:number;deadline:number;remaining:number;version:number;created:number;expires:number};
export const ARENA_LIMIT=100;
const leaderboardCache=new Map<string,{expires:number;value:Promise<any[]>}>();
export function invalidateArena(code:string){for(const key of leaderboardCache.keys())if(key.startsWith(code+':'))leaderboardCache.delete(key);}
export async function arenaOwner(req:Request){
 if(new URL(req.url).searchParams.get('admin')==='1')return await admin(req)?{id:'admin:'+req.headers.get('oai-authenticated-user-id'),isAdmin:true}:null;
 const u=await creator(req.headers.get('cookie'));return u?{id:u.id,isAdmin:false}:null;
}
export function roomCode(value:string){return /^[A-Z2-9]{6}$/.test(value);}
export function newCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>alphabet[b%32]).join('');}
export async function room(code:string){if(!roomCode(code))return null;return db().prepare('SELECT * FROM arena_rooms WHERE code=? AND expires>?').bind(code,Date.now()).first<ArenaRoom>();}
export async function participant(req:Request,code:string){const token=req.headers.get('x-arena-token');if(!token||!/^[a-f0-9]{64}$/.test(token))return null;return db().prepare('SELECT id,name FROM arena_players WHERE room_code=? AND token_hash=?').bind(code,await digest(token)).first<{id:string;name:string}>();}
export function nickname(value:unknown){if(typeof value!=='string')throw Error('Enter a player or team name.');const name=value.trim().replace(/\s+/g,' ');if(!name||name.length>32||/[\x00-\x1f\x7f]/.test(name))throw Error('Use a name of 1–32 characters.');return name;}
export function publicQuestion(q:Question){return {prompt:q.prompt,options:q.options,...(q.image?{image:q.image}:{}),...(q.diagram?{diagram:q.diagram}:{})};}
export function transition(r:ArenaRoom,action:string,now=Date.now()){
 const total=(JSON.parse(r.questions) as Question[]).length;
 let status=r.status,index=r.question_index,deadline=r.deadline,remaining=r.remaining;
 if(action==='start'&&status==='lobby'){status='question';index=0;deadline=now+r.seconds*1000;remaining=0;}
 else if(action==='pause'&&status==='question'&&deadline>now){status='paused';remaining=deadline-now;deadline=0;}
 else if(action==='resume'&&status==='paused'){status='question';deadline=now+remaining;remaining=0;}
 else if(action==='reveal'&&(status==='question'||status==='paused')){status='reveal';deadline=0;remaining=0;}
 else if(action==='next'&&status==='reveal'){if(index+1>=total){status='finished';}else{status='question';index++;deadline=now+r.seconds*1000;}}
 else if(action==='finish'&&(status==='lobby'||status==='reveal')){status='finished';deadline=0;remaining=0;}
 else throw Error('This action is unavailable. Refresh the room and try again.');
 return {status,index,deadline,remaining};
}
export async function arenaState(r:ArenaRoom,player:{id:string;name:string}|null,isHost=false){
 const questions=JSON.parse(r.questions) as Question[];
 const cutoff=r.status==='reveal'||r.status==='finished'?r.question_index:r.question_index-1;
 const cacheKey=r.code+':'+r.version+':'+cutoff;const cached=leaderboardCache.get(cacheKey);let leaders:any[];
 if(cached&&cached.expires>Date.now())leaders=await cached.value;
 else{const value=(async()=>{const rows=await db().prepare('SELECT p.id,p.name,COALESCE(SUM(CASE WHEN a.question_index<=? THEN a.points ELSE 0 END),0) AS score,COALESCE(SUM(CASE WHEN a.question_index<=? AND a.points>0 THEN 1 ELSE 0 END),0) AS correct FROM arena_players p LEFT JOIN arena_answers a ON a.player_id=p.id AND a.room_code=p.room_code WHERE p.room_code=? GROUP BY p.id ORDER BY score DESC,p.joined ASC,p.id ASC').bind(cutoff,cutoff,r.code).all<any>();return rows.results.map((p:any,i:number,all:any[])=>({...p,rank:i===0?1:all.findIndex(x=>x.score===p.score)+1}));})();if(leaderboardCache.size>=200)leaderboardCache.delete(leaderboardCache.keys().next().value!);leaderboardCache.set(cacheKey,{expires:Date.now()+2000,value});try{leaders=await value;}catch(e){leaderboardCache.delete(cacheKey);throw e;}}

 const answered=await db().prepare('SELECT COUNT(*) AS n FROM arena_answers WHERE room_code=? AND question_index=?').bind(r.code,r.question_index).first<{n:number}>();
 const mine=player?await db().prepare('SELECT selected FROM arena_answers WHERE room_code=? AND player_id=? AND question_index=?').bind(r.code,player.id,r.question_index).first<{selected:number}>():null;
 const q=questions[r.question_index];const revealed=r.status==='reveal'||r.status==='finished';
 return {code:r.code,title:r.title,mode:r.mode,seconds:r.seconds,status:r.status,index:r.question_index,total:questions.length,deadline:r.deadline,remaining:r.remaining,version:r.version,expires:r.expires,serverNow:Date.now(),limit:ARENA_LIMIT,players:leaders.length,answered:answered?.n||0,leaderboard:leaders,me:player?{...player,selected:mine?.selected??null}:null,question:q&&r.status!=='lobby'?{...publicQuestion(q),...(revealed?{correct:q.correct,explanation:q.explanation}:{})}:null,...(isHost?{isHost:true}:{})};
}
