import {env} from 'cloudflare:workers';
import {creator} from './accounts';
import {administrator} from './server';
import {aiStore} from './ai-store';
import {freeAllowancePeriod,FREE_QUESTION_LIMIT} from './free-allowance';
export const settings=()=>env as any;
export async function aiUser(req:Request){if(new URL(req.url).searchParams.get('admin')==='1')return administrator(req);return creator(req.headers.get('cookie'));}
export async function wallet(id:string){return (await aiStore()).wallet(id,freeAllowancePeriod().start,FREE_QUESTION_LIMIT);}
export async function refundReservation(id:string,jobId:string,expiredOnly=false){
 await wallet(id);
 await (await aiStore()).refund({userId:id,jobId,expiredOnly,periodStart:freeAllowancePeriod().start,now:Date.now()});
}
export async function stripe(path:string,params?:URLSearchParams){const r=await fetch('https://api.stripe.com/v1/'+path,{method:params?'POST':'GET',headers:{Authorization:'Bearer '+settings().STRIPE_SECRET_KEY,...(params?{'Content-Type':'application/x-www-form-urlencoded','Stripe-Version':'2026-08-26.dahlia'}:{})},body:params,signal:AbortSignal.timeout(20000)});const x:any=await r.json();if(!r.ok)throw Error('Payment service unavailable. Please try again.');return x;}
