import {body,db,response,sameOrigin} from '../../../lib/server';
import {creator,digest,emailAddress,equal,passwordHash,SESSION_COOKIE,throttle} from '../../../lib/accounts';
export const dynamic='force-dynamic';
export async function GET(req:Request){const user=await creator(req.headers.get('cookie'));return user?response({email:user.email}):response({error:'Please sign in.'},401);}
export async function POST(req:Request){if(!sameOrigin(req))return response({error:'Invalid origin.'},403);
 try{const x=await body(req);const email=emailAddress(x.email);if(!['register','login'].includes(x.action)||typeof x.password!=='string'||x.password.length>128)throw Error('Check your email and password.');
 const ip=req.headers.get('cf-connecting-ip')||'unknown';if(!await throttle('ip:'+ip,60)||!await throttle('email:'+email,12))return response({error:'Too many attempts. Please try again in 15 minutes.'},429);
 let user=await db().prepare('SELECT * FROM creator_users WHERE email=?').bind(email).first<any>();
 if(x.action==='register'){if(x.password.length<12)throw Error('Use a password of at least 12 characters.');if(user)return response({error:'Unable to create account. Try signing in or use another email.'},400);
 const salt=crypto.randomUUID(),id=crypto.randomUUID(),hash=await passwordHash(x.password,salt);await db().prepare('INSERT INTO creator_users(id,email,password_hash,salt,created) VALUES(?,?,?,?,?)').bind(id,email,hash,salt,new Date().toISOString()).run();user={id,email,password_hash:hash,salt};
 }else{const hash=await passwordHash(x.password,user?.salt||'unregistered-account');if(!user||!equal(hash,user.password_hash))return response({error:'Email or password is incorrect.'},401);}
 const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');await db().batch([db().prepare('DELETE FROM creator_sessions WHERE expires<=?').bind(Date.now()),db().prepare('INSERT INTO creator_sessions(token_hash,user_id,expires) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM creator_users WHERE id=? AND password_hash=? AND salt=?)').bind(await digest(token),user.id,Date.now()+604800000,user.id,user.password_hash,user.salt)]);
 if(!await db().prepare('SELECT token_hash FROM creator_sessions WHERE token_hash=?').bind(await digest(token)).first())return response({error:'Email or password is incorrect.'},401);
 const out=response({ok:true});out.headers.set('Set-Cookie',SESSION_COOKIE+'='+token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800');return out;
 }catch(e){return response({error:e instanceof Error?e.message:'Unable to sign in.'},400);}}
export async function DELETE(req:Request){if(!sameOrigin(req))return response({error:'Invalid origin.'},403);const token=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);if(token)await db().prepare('DELETE FROM creator_sessions WHERE token_hash=?').bind(await digest(token)).run();const out=response({ok:true});out.headers.set('Set-Cookie',SESSION_COOKIE+'=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');return out;}
