import {env} from 'cloudflare:workers';
import {creator} from './accounts';
import {admin,db} from './server';
import {freeAllowancePeriod,FREE_QUESTION_LIMIT} from './free-allowance';
export const settings=()=>env as any;
export async function aiUser(req:Request){if(new URL(req.url).searchParams.get('admin')==='1')return await admin(req)?{id:'admin:'+req.headers.get('oai-authenticated-user-id'),email:req.headers.get('oai-authenticated-user-email')!}:null;return creator(req.headers.get('cookie'));}
export async function wallet(id:string){
 const {start}=freeAllowancePeriod();
 await db().prepare('INSERT INTO ai_wallets(user_id,free_period_start) VALUES(?,?) ON CONFLICT DO NOTHING').bind(id,start).run();
 // One conditional update prevents concurrent reads from granting multiple refills.
 // Existing accounts retain this month's remaining allowance on migration.
 await db().prepare('UPDATE ai_wallets SET free_remaining=CASE WHEN free_period_start>0 AND free_period_start<? THEN ? ELSE MIN(?,MAX(0,free_remaining)) END,free_period_start=MAX(free_period_start,?) WHERE user_id=? AND (free_period_start<? OR free_remaining>? OR free_remaining<0)').bind(start,FREE_QUESTION_LIMIT,FREE_QUESTION_LIMIT,start,id,start,FREE_QUESTION_LIMIT).run();
 return (await db().prepare('SELECT * FROM ai_wallets WHERE user_id=?').bind(id).first()) as any;
}
export async function refundReservation(id:string,jobId:string,expiredOnly=false){
 await wallet(id);
 await db().batch([
  db().prepare("UPDATE ai_wallets SET free_remaining=MIN(20,free_remaining+COALESCE((SELECT free FROM ai_jobs WHERE id=? AND user_id=? AND status='running' AND created>=free_period_start),0)),credits=credits+COALESCE((SELECT paid FROM ai_jobs WHERE id=? AND user_id=? AND status='running'),0),lock_id=NULL,locked_until=0 WHERE user_id=? AND lock_id=? AND (?=0 OR locked_until<=?)").bind(jobId,id,jobId,id,id,jobId,expiredOnly?1:0,Date.now()),
  db().prepare("UPDATE ai_jobs SET status='failed' WHERE id=? AND user_id=? AND status='running' AND NOT EXISTS(SELECT 1 FROM ai_wallets WHERE user_id=? AND lock_id=?)").bind(jobId,id,id,jobId)
 ]);
}
export async function stripe(path:string,params?:URLSearchParams){const r=await fetch('https://api.stripe.com/v1/'+path,{method:params?'POST':'GET',headers:{Authorization:'Bearer '+settings().STRIPE_SECRET_KEY,...(params?{'Content-Type':'application/x-www-form-urlencoded','Stripe-Version':'2026-08-26.dahlia'}:{})},body:params,signal:AbortSignal.timeout(20000)});const x:any=await r.json();if(!r.ok)throw Error('Payment service unavailable. Please try again.');return x;}
