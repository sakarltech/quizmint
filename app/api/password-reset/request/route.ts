import {passwordResetStore} from '../../../../lib/password-reset-store';
import {body,response,sameOrigin,clientIp} from '../../../../lib/server';
import {digest,emailAddress,throttle} from '../../../../lib/accounts';
import {resetEmailEnabled,sendResetEmail,emailOrigin} from '../../../../lib/reset-email';
import {runInBackground} from '../../../../lib/runtime-context';
export const dynamic='force-dynamic';
const message='If an account exists for this email, a reset link will be sent if delivery is available. Check your inbox and spam folder. Only the most recent link works.';
export async function GET(){return response({enabled:resetEmailEnabled()});}
export async function POST(req:Request){
 if(!sameOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return response({error:'Invalid origin.'},403);
 try{
  const x=await body(req),email=emailAddress(x.email);
  if(!await throttle('reset-ip:'+clientIp(req),10))return response({error:'Please wait 15 minutes before requesting more reset links.'},429);
  if(!resetEmailEnabled())return response({error:'Password recovery email is not configured yet. Contact admin@sakarltech.com for help.'},503);
  if(!await throttle('reset-email:'+email,3))return response({message},202);
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),hash=await digest(token),now=Date.now();
  const store=await passwordResetStore(),issued=await store.issue(email,hash,now);
  if(issued){
   // Pin the trusted domain; never construct recovery URLs from Host headers.
   const origin=emailOrigin(),link=origin+'/reset-password#token='+token;
   const task=sendResetEmail(email,'Reset your QuizMint password',`You requested a new password for QuizMint.\n\nOpen this link to choose a new password:\n${link}\n\nThis link expires in 30 minutes and can be used once. Requesting it does not change your password. If you did not request it, ignore this email. Never share the link.\n\nQuizMint · ${origin}`,'password-reset/'+hash).catch(async()=>{await store.invalidate(hash);console.warn('Password reset email delivery failed');});
   await runInBackground(task);
  }
  return response({message},202);
 }catch{return response({error:'Enter a valid email address or try again later.'},400);}
}
