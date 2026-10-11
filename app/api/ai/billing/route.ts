import {aiUser,wallet,settings,stripe} from '../../../../lib/ai-server';
import {body,response,sameOrigin} from '../../../../lib/server';
import {plans} from '../../../../lib/ai-plans';
import {throttle} from '../../../../lib/accounts';
export const dynamic='force-dynamic';
export async function POST(req:Request){if(!sameOrigin(req))return response({error:'Invalid origin.'},403);const u=await aiUser(req);if(!u)return response({error:'Creator sign-in required.'},401);if(!settings().OPENAI_API_KEY||!settings().STRIPE_SECRET_KEY||!settings().STRIPE_WEBHOOK_SECRET)return response({error:'Payments are not yet enabled. No charge has been made.'},503);
 try{if(!await throttle('checkout:'+u.id,10))return response({error:'Please wait before requesting another checkout.'},429);const x=await body(req);if(u.id.startsWith('admin:'))return response({error:'Administrator AI is free. No purchase is required.'},400);const w=await wallet(u.id);const origin=new URL(req.url).origin;const back=origin+(u.id.startsWith('admin:')?'/admin':'/teacher');
 if(x.portal){if(!w.customer)throw Error('No billing account yet.');const session=await stripe('billing_portal/sessions',new URLSearchParams({customer:w.customer,return_url:back}));return response({url:session.url});}
 const p=plans.find(p=>p.id===x.plan);if(!p)throw Error('Choose a valid plan.');if(p.mode==='subscription'&&w.subscription_end>Date.now())throw Error('You already have an active subscription. Use Manage subscription.');
 const label='quizmint_'+Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>String.fromCharCode(97+n%26)).join('');const params=new URLSearchParams({integration_identifier:label,mode:p.mode,success_url:back+'?payment=success',cancel_url:back+'?payment=cancelled',client_reference_id:u.id,'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'gbp','line_items[0][price_data][unit_amount]':String(p.amount),'line_items[0][price_data][product_data][name]':'QuizMint — '+p.name,'metadata[user_id]':u.id,'metadata[plan]':p.id,'metadata[questions]':String(p.questions)});
 if(w.customer)params.set('customer',w.customer);else{params.set('customer_email',u.email);if(p.mode==='payment')params.set('customer_creation','always');}
 if(p.mode==='subscription'){params.set('line_items[0][price_data][recurring][interval]',p.interval);params.set('subscription_data[metadata][user_id]',u.id);params.set('subscription_data[metadata][plan]',p.id);}
 const session=await stripe('checkout/sessions',params);return response({url:session.url});
 }catch(e){return response({error:(e as Error).message},400);}}
