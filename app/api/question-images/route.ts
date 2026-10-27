import {response,sameOrigin} from '../../../lib/server';
import {throttle} from '../../../lib/accounts';
import {IMAGE_BYTES,imageBucket,imageOwner,rasterType} from '../../../lib/question-images';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(!sameOrigin(req))return response({error:'Invalid origin.'},403);
 const owner=await imageOwner(req,new URL(req.url).searchParams.get('admin')==='1');if(!owner)return response({error:'Creator sign-in required.'},401);
 try{
  if(!await throttle('images:'+owner,60))return response({error:'Please wait before uploading more images.'},429);
  if(Number(req.headers.get('content-length')||0)>IMAGE_BYTES)throw Error('Use an image up to 600 KB after resizing.');
  const reader=req.body?.getReader();if(!reader)throw Error('Choose an image.');let size=0;const chunks:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>IMAGE_BYTES){await reader.cancel();throw Error('Use an image up to 600 KB after resizing.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const type=rasterType(bytes);if(!type)throw Error('Use a PNG, JPG or WebP image. SVG and animated files are not supported.');
  const id=crypto.randomUUID().replaceAll('-','');try{await (await imageBucket()).put('question-images/'+id,bytes,{httpMetadata:{contentType:type},customMetadata:{owner,created:String(Date.now())}});}catch{throw Error('Image uploads are unavailable. Please retry later.');}
  return response({id},201);
 }catch(e){return response({error:(e as Error).message||'Image upload failed.'},400);}
}
