import {creator} from '../../../lib/accounts';
import {body,db,response,sameOrigin} from '../../../lib/server';
import {emptyProfile,validateProfile} from '../../../lib/creator-profile';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const user=await creator(req.headers.get('cookie'));if(!user)return response({error:'Creator sign-in required.'},401);
 const row=await db().prepare('SELECT profile,updated FROM creator_profiles WHERE user_id=?').bind(user.id).first<any>();return response({email:user.email,profile:row?JSON.parse(row.profile):emptyProfile,completed:!!row,updated:row?.updated||null});
}
export async function PUT(req:Request){
 if(!sameOrigin(req))return response({error:'Invalid origin.'},403);const user=await creator(req.headers.get('cookie'));if(!user)return response({error:'Creator sign-in required.'},401);
 try{const profile=validateProfile(await body(req));await db().prepare('INSERT INTO creator_profiles(user_id,profile,updated) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET profile=excluded.profile,updated=excluded.updated').bind(user.id,JSON.stringify(profile),new Date().toISOString()).run();return response({profile,completed:true});}catch(e){return response({error:(e as Error).message||'Unable to save your profile.'},400);}
}
