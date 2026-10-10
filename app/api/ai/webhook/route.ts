import {settings,stripe,wallet} from '../../../../lib/ai-server';
import {db,response} from '../../../../lib/server';
import {plans,verifyStripe} from '../../../../lib/ai-plans';
export const dynamic='force-dynamic';
export async function POST(req:Request){if(!settings().STRIPE_WEBHOOK_SECRET||!settings().STRIPE_SECRET_KEY)return response({error:'Payments unavailable.'},503);if(Number(req.headers.get('content-length')||0)>1000000)return response({error:'Too large.'},413);const raw=await req.text();if(raw.length>1000000||!await verifyStripe(raw,req.headers.get('stripe-signature')||'',settings().STRIPE_WEBHOOK_SECRET))return response({error:'Invalid signature.'},400);
 try{const event=JSON.parse(raw);const o=event.data.object;
 if(event.type==='checkout.session.completed'&&o.mode==='payment'&&o.payment_status==='paid'){
 const p=plans.find(p=>p.id===o.metadata?.plan&&p.mode==='payment');const uid=o.metadata?.user_id;if(!p||!uid||o.amount_total!==p.amount||o.currency!=='gbp')throw Error('Payment metadata mismatch');await wallet(uid);
 // Deduplicate by checkout session, not event ID, in the same transaction as credit fulfilment.
 await db().batch([db().prepare('UPDATE ai_wallets SET credits=credits+?,customer=COALESCE(?,customer) WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM ai_payments WHERE id=?)').bind(p.questions,o.customer,uid,o.id),db().prepare('INSERT INTO ai_payments(id,user_id,created) VALUES(?,?,?) ON CONFLICT DO NOTHING').bind(o.id,uid,Date.now())]);
 }else if(event.type==='invoice.paid'){
 const sid=o.subscription||o.parent?.subscription_details?.subscription; if(sid){const s=await stripe('subscriptions/'+encodeURIComponent(sid));const uid=s.metadata?.user_id;const ends=s.items?.data?.map((i:any)=>i.current_period_end)||[];const end=(s.current_period_end||Math.max(0,...ends))*1000;
 if(uid&&s.metadata?.plan==='monthly'&&['active','trialing'].includes(s.status)&&end>Date.now()){await wallet(uid);await db().prepare('UPDATE ai_wallets SET subscription_end=MAX(subscription_end,?),customer=? WHERE user_id=?').bind(end,s.customer,uid).run();}}
 }else if(event.type==='customer.subscription.deleted'){
 const uid=o.metadata?.user_id;if(uid)await db().prepare('UPDATE ai_wallets SET subscription_end=0 WHERE user_id=? AND customer=?').bind(uid,o.customer).run();
 }
 return response({received:true});}catch{console.error('AI billing webhook failed');return response({error:'Webhook processing failed. Retry required.'},500);}}
