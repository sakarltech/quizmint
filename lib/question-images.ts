import {env} from 'cloudflare:workers';
import {admin,db} from './server';
import {creator} from './accounts';
export const IMAGE_BYTES=600*1024;
export const imageId=(id:unknown):id is string=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
export function imageBucket(){if(!env.BUCKET)throw Error('Image uploads are unavailable. Please retry later.');return env.BUCKET;}
export async function imageOwner(req:Request,adminMode=false){
 if(adminMode)return await admin(req)?'admin:'+req.headers.get('oai-authenticated-user-id'):null;
 return (await creator(req.headers.get('cookie')))?.id||null;
}
export async function verifyQuestionImages(questions:any[],owner:string){
 const ids=[...new Set<string>(questions.flatMap(q=>q.image?[q.image.id]:[]))];
 await Promise.all(ids.map(async id=>{const asset=await imageBucket().head('question-images/'+id);if(!asset||asset.customMetadata?.owner!==owner)throw Error('One of the question images is unavailable or belongs to another account. Upload it again.');}));
}
export function rasterType(bytes:Uint8Array){
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 return null;
}
export async function imageInQuiz(id:string,quiz:string){
 const q=await db().prepare('SELECT questions,active FROM quizzes WHERE id=?').bind(quiz).first<any>();
 return !!(q?.active&&JSON.parse(q.questions).some((question:any)=>question.image?.id===id));
}
