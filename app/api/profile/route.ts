import {libraryStore} from '../../../lib/library-store';
import {creator} from '../../../lib/accounts';
import {body,response,sameOrigin} from '../../../lib/server';
import {emptyProfile,validateProfile} from '../../../lib/creator-profile';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const user=await creator(req.headers.get('cookie'));if(!user)return response({error:'Creator sign-in required.'},401);
 const row=await (await libraryStore()).profile(user.id);return response({email:user.email,profile:row?JSON.parse(row.profile):emptyProfile,completed:!!row,updated:row?.updated||null});
}
export async function PUT(req:Request){
 if(!sameOrigin(req))return response({error:'Invalid origin.'},403);const user=await creator(req.headers.get('cookie'));if(!user)return response({error:'Creator sign-in required.'},401);
 try{const profile=validateProfile(await body(req));await (await libraryStore()).saveProfile(user.id,profile,new Date().toISOString());return response({profile,completed:true});}catch(e){return response({error:(e as Error).message||'Unable to save your profile.'},400);}
}
