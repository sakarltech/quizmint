import {passwordResetStore} from '../../../../lib/password-reset-store';
import {body,response,sameOrigin} from '../../../../lib/server';
import {digest,passwordHash,SESSION_COOKIE,throttle} from '../../../../lib/accounts';
import {resetEmailEnabled,sendResetEmail,emailOrigin} from '../../../../lib/reset-email';
import {runInBackground} from '../../../../lib/runtime-context';
export const dynamic='force-dynamic';
const invalid='This reset link is invalid, expired or already used. Request a new link.';
export async function POST(req:Request){
 if(!sameOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return response({error:'Invalid origin.'},403);
 try{
  const x=await body(req);if(typeof x.token!=='string'||!/^[a-f0-9]{64}$/.test(x.token))return response({error:invalid},400);
  if(typeof x.password!=='string'||x.password.length<12||x.password.length>128||x.password!==x.confirmPassword)return response({error:'Use 12–128 characters and make sure both passwords match.'},400);
  if(!await throttle('reset-complete:'+(req.headers.get('cf-connecting-ip')||'unknown'),20))return response({error:'Please wait 15 minutes before trying again.'},429);
  const hash=await digest(x.token),now=Date.now();
  const store=await passwordResetStore(),user=await store.find(hash,now);
  if(!user)return response({error:invalid},400);
  const salt=crypto.randomUUID(),newHash=await passwordHash(x.password,salt);
  const changed=await store.consume({userId:user.id,tokenHash:hash,previousHash:user.password_hash,newHash,salt,now});if(!changed)return response({error:invalid},400);
  if(resetEmailEnabled())await runInBackground(sendResetEmail(user.email,'Your QuizMint password has changed',`Your QuizMint password was changed successfully. All existing creator sessions were signed out. Sign in with your new password at ${emailOrigin()}/login.\n\nIf you did not make this change, request a new reset link immediately and contact admin@sakarltech.com.`,'password-changed/'+hash).catch(()=>{console.warn('Password change notice delivery failed');}));
  const out=response({ok:true});out.headers.set('Set-Cookie',SESSION_COOKIE+'=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');return out;
 }catch{return response({error:'Unable to reset your password. Please request a new link or try again later.'},400);}
}
