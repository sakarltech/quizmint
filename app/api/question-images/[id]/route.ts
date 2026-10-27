import {response,sameOrigin} from '../../../../lib/server';
import {imageBucket,imageId,imageOwner,imageInQuiz,imageInArena,imageUsed} from '../../../../lib/question-images';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!imageId(id))return response({error:'Image not found.'},404);
 const url=new URL(req.url);
 try{
  const bucket=await imageBucket();const asset=await bucket.head('question-images/'+id);if(!asset)return response({error:'Image not found.'},404);
  const published=url.searchParams.get('quiz');
  const arena=url.searchParams.get('arena');
  const allowed=arena?await imageInArena(id,arena):published?await imageInQuiz(id,published):asset.customMetadata?.owner===await imageOwner(req,url.searchParams.get('admin')==='1');
  if(!allowed)return response({error:'Image not found.'},404);
  const content=await bucket.get('question-images/'+id);if(!content)return response({error:'Image not found.'},404);
  return new Response(content.body,{headers:{'Content-Type':asset.httpMetadata?.contentType||'image/png','Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
 }catch{return response({error:'Image unavailable.'},503);}
}
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(req))return response({error:'Invalid origin.'},403);
 const owner=await imageOwner(req,new URL(req.url).searchParams.get('admin')==='1');if(!owner)return response({error:'Creator sign-in required.'},401);
 const {id}=await params;if(!imageId(id))return response({error:'Image not found.'},404);
 try{
  const asset=await (await imageBucket()).head('question-images/'+id);if(!asset||asset.customMetadata?.owner!==owner)return response({error:'Image not found.'},404);
  if(await imageUsed(id))return response({error:'This image is used by a saved quiz or competition.'},409);
  await (await imageBucket()).delete('question-images/'+id);return response({ok:true});
 }catch{return response({error:'Unable to remove image.'},400);}
}
