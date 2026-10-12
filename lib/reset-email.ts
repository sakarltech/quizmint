import {env} from 'cloudflare:workers';
import {db} from './server';
import {digest} from './accounts';
export function resetEmailEnabled(){const config=env as any;return !!config.RESEND_API_KEY&&typeof config.EMAIL_FROM==='string'&&/^[^\r\n]+@[^\r\n]+$/.test(config.EMAIL_FROM);}
export async function sendResetEmail(to:string,subject:string,text:string,id:string){
 if(!resetEmailEnabled())throw Error('Reset email service unavailable.');
 const config=env as any,day=Math.floor(Date.now()/86400000),key=await digest('password-email-global');
 const configured=Number(config.PASSWORD_RESET_DAILY_EMAIL_LIMIT);const limit=Number.isInteger(configured)&&configured>0?Math.min(configured,100000):100;
 const admitted=await db().prepare('INSERT INTO auth_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END WHERE window!=excluded.window OR count<? RETURNING count').bind(key,day,limit).first();
 if(!admitted)throw Error('Reset email daily limit reached.');
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},signal:AbortSignal.timeout(15000),body:JSON.stringify({from:config.EMAIL_FROM,to:[to],subject,text})});
 if(!r.ok)throw Error('Reset email could not be delivered.');
}
