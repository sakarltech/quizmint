import {aiStore} from '../../../../lib/ai-store';
import {freeAllowancePeriod} from '../../../../lib/free-allowance';
import {settings,stripe,wallet} from '../../../../lib/ai-server';
import {response} from '../../../../lib/server';
import {plans,verifyStripe} from '../../../../lib/ai-plans';
export const dynamic='force-dynamic';
export async function POST(req:Request){if(!settings().STRIPE_WEBHOOK_SECRET||!settings().STRIPE_SECRET_KEY)return response({error:'Payments unavailable.'},503);if(Number(req.headers.get('content-length')||0)>1000000)return response({error:'Too large.'},413);const raw=await req.text();if(raw.length>1000000||!await verifyStripe(raw,req.headers.get('stripe-signature')||'',settings().STRIPE_WEBHOOK_SECRET))return response({error:'Invalid signature.'},400);
 try{const event=JSON.parse(raw);const o=event.data.object;
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&o.mode==='payment'&&o.payment_status==='paid'){
 const p=plans.find(p=>p.id===o.metadata?.plan&&p.mode==='payment');const uid=o.metadata?.user_id;if(!p||!uid||o.amount_total!==p.amount||o.currency!=='gbp')throw Error('Payment metadata mismatch');await wallet(uid);
 // Deduplicate by checkout session, not event ID, in the same transaction as credit fulfilment.
 await (await aiStore()).fulfilPayment({userId:uid,sessionId:o.id,questions:p.questions,customer:o.customer||null,periodStart:freeAllowancePeriod().start,now:Date.now()});
 }else if(event.type==='invoice.paid'){
 const sid=o.subscription||o.parent?.subscription_details?.subscription; if(sid){const s=await stripe('subscriptions/'+encodeURIComponent(sid));const uid=s.metadata?.user_id;const ends=s.items?.data?.map((i:any)=>i.current_period_end)||[];const end=(s.current_period_end||Math.max(0,...ends))*1000;
 if(uid&&plans.some(p=>p.id===s.metadata?.plan&&p.mode==='subscription')&&['active','trialing'].includes(s.status)&&end>Date.now()){await wallet(uid);await (await aiStore()).extendSubscription(uid,end,s.customer);}}
 }else if(event.type==='customer.subscription.deleted'){
 const uid=o.metadata?.user_id;if(uid)await (await aiStore()).cancelSubscription(uid,o.customer);
 }
 return response({received:true});}catch{console.error('AI billing webhook failed');return response({error:'Webhook processing failed. Retry required.'},500);}}
