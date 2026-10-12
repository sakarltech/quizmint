import {body,db,response,sameOrigin} from '../../../../lib/server';
import {digest,passwordHash,SESSION_COOKIE,throttle} from '../../../../lib/accounts';
import {resetEmailEnabled,sendResetEmail} from '../../../../lib/reset-email';
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
  const user:any=await db().prepare('SELECT u.id,u.email,u.password_hash FROM creator_password_resets r JOIN creator_users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used=0 AND r.expires>? AND r.password_hash=u.password_hash').bind(hash,now).first();
  if(!user)return response({error:invalid},400);
  const salt=crypto.randomUUID(),newHash=await passwordHash(x.password,salt);
  await db().batch([
   db().prepare('UPDATE creator_users SET password_hash=?,salt=? WHERE id=? AND password_hash=? AND EXISTS(SELECT 1 FROM creator_password_resets WHERE user_id=? AND token_hash=? AND used=0 AND expires>?)').bind(newHash,salt,user.id,user.password_hash,user.id,hash,Date.now()),
   db().prepare('UPDATE creator_password_resets SET used=? WHERE user_id=? AND token_hash=? AND used=0 AND EXISTS(SELECT 1 FROM creator_users WHERE id=? AND password_hash=? AND salt=?)').bind(now,user.id,hash,user.id,newHash,salt),
   db().prepare('DELETE FROM creator_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM creator_password_resets r JOIN creator_users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used=? AND u.password_hash=? AND u.salt=?)').bind(user.id,hash,now,newHash,salt)
  ]);
  const changed=await db().prepare('SELECT id FROM creator_users WHERE id=? AND password_hash=? AND salt=?').bind(user.id,newHash,salt).first();if(!changed)return response({error:invalid},400);
  if(resetEmailEnabled())await runInBackground(sendResetEmail(user.email,'Your QuizMint password has changed','Your QuizMint password was changed successfully. All existing creator sessions were signed out. Sign in with your new password at https://www.quizmint.co.uk/login.\n\nIf you did not make this change, request a new reset link immediately and contact admin@sakarltech.com.','password-changed/'+hash).catch(()=>{console.warn('Password change notice delivery failed');}));
  const out=response({ok:true});out.headers.set('Set-Cookie',SESSION_COOKIE+'=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');return out;
 }catch{return response({error:'Unable to reset your password. Please request a new link or try again later.'},400);}
}
