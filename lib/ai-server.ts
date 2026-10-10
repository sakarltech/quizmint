import {env} from 'cloudflare:workers';
import {creator} from './accounts';
import {admin,db} from './server';
export const settings=()=>env as any;
export async function aiUser(req:Request){if(await admin(req))return {id:'admin:'+req.headers.get('oai-authenticated-user-id'),email:req.headers.get('oai-authenticated-user-email')!};const c=await creator(req.headers.get('cookie'));return c;}
export async function wallet(id:string){await db().prepare('INSERT INTO ai_wallets(user_id) VALUES(?) ON CONFLICT DO NOTHING').bind(id).run();return (await db().prepare('SELECT * FROM ai_wallets WHERE user_id=?').bind(id).first()) as any;}
export async function stripe(path:string,params?:URLSearchParams){const r=await fetch('https://api.stripe.com/v1/'+path,{method:params?'POST':'GET',headers:{Authorization:'Bearer '+settings().STRIPE_SECRET_KEY,...(params?{'Content-Type':'application/x-www-form-urlencoded','Stripe-Version':'2026-08-26.dahlia'}:{})},body:params,signal:AbortSignal.timeout(20000)});const x:any=await r.json();if(!r.ok)throw Error('Payment service unavailable. Please try again.');return x;}
