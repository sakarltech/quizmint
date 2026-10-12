import {body,db,response,sameOrigin} from '../../../../lib/server';
import {digest,emailAddress,throttle} from '../../../../lib/accounts';
import {resetEmailEnabled,sendResetEmail} from '../../../../lib/reset-email';
import {runInBackground} from '../../../../lib/runtime-context';
export const dynamic='force-dynamic';
const message='If an account exists for this email, a reset link will be sent if delivery is available. Check your inbox and spam folder. Only the most recent link works.';
export async function GET(){return response({enabled:resetEmailEnabled()});}
export async function POST(req:Request){
 if(!sameOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return response({error:'Invalid origin.'},403);
 try{
  const x=await body(req),email=emailAddress(x.email);
  if(!await throttle('reset-ip:'+(req.headers.get('cf-connecting-ip')||'unknown'),10))return response({error:'Please wait 15 minutes before requesting more reset links.'},429);
  if(!resetEmailEnabled())return response({error:'Password recovery email is not configured yet. Contact admin@sakarltech.com for help.'},503);
  if(!await throttle('reset-email:'+email,3))return response({message},202);
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),hash=await digest(token),now=Date.now();
  await db().prepare('DELETE FROM creator_password_resets WHERE expires<=?').bind(now).run();
  // The same database operations run for registered and unregistered addresses.
  await db().prepare('INSERT INTO creator_password_resets(user_id,token_hash,password_hash,expires,used,created) SELECT id,?,password_hash,?,0,? FROM creator_users WHERE email=? ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,password_hash=excluded.password_hash,expires=excluded.expires,used=0,created=excluded.created').bind(hash,now+1800000,now,email).run();
  const row:any=await db().prepare('SELECT user_id FROM creator_password_resets WHERE token_hash=?').bind(hash).first();
  if(row){
   // Pin the trusted domain; never construct recovery URLs from Host headers.
   const link='https://www.quizmint.co.uk/reset-password#token='+token;
   const task=sendResetEmail(email,'Reset your QuizMint password',`You requested a new password for QuizMint.\n\nOpen this link to choose a new password:\n${link}\n\nThis link expires in 30 minutes and can be used once. Requesting it does not change your password. If you did not request it, ignore this email. Never share the link.\n\nQuizMint · https://www.quizmint.co.uk`,'password-reset/'+hash).catch(async()=>{await db().prepare('UPDATE creator_password_resets SET used=? WHERE token_hash=?').bind(Date.now(),hash).run();console.warn('Password reset email delivery failed');});
   await runInBackground(task);
  }
  return response({message},202);
 }catch{return response({error:'Enter a valid email address or try again later.'},400);}
}
