'use client';
import type {Survey} from '../lib/survey';

async function prepareImage(file:File):Promise<string>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a PNG, JPEG or WebP image up to 10 MB.');
 const bitmap=await createImageBitmap(file);
 try {
  const canvas=document.createElement('canvas');const scale=Math.min(1,800/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Unable to process this image.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let result=canvas.toDataURL('image/webp',0.8);
  while(result.length>45000&&canvas.width>100&&canvas.height>100){const smaller=document.createElement('canvas');smaller.width=Math.max(1,Math.round(canvas.width*0.8));smaller.height=Math.max(1,Math.round(canvas.height*0.8));smaller.getContext('2d')!.drawImage(canvas,0,0,smaller.width,smaller.height);canvas.width=smaller.width;canvas.height=smaller.height;ctx.drawImage(smaller,0,0);result=canvas.toDataURL('image/webp',0.7);}
  if(result.length>45000||!/^data:image\/(png|jpeg|webp);base64,/.test(result))throw Error('This image could not be made small enough. Try a simpler image.');return result;
 } finally {bitmap.close();}
}

export default function SurveyBranding({survey,onChange,onError}:{survey:Survey;onChange:(changes:Partial<Survey>)=>void;onError:(message:string)=>void}){
 async function upload(field:'logo'|'cover',file?:File){if(!file)return;try{onChange({[field]:await prepareImage(file)});onError('');}catch(e){onError(e instanceof Error?e.message:'Unable to process image.');}}
 return <section className="editor-card"><h2>Personalise your survey</h2><p className="fine">Add a logo, a cover photo and an accent colour. Images are resized to fit.</p>{(['logo','cover'] as const).map(field=><div key={field}><label>{field==='logo'?'Logo':'Cover photo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void upload(field,e.target.files?.[0]);e.target.value='';}}/></label>{survey[field]&&<><img className={field==='logo'?'survey-logo':'survey-cover'} src={survey[field]} alt={field==='logo'?'Survey logo preview':'Survey cover preview'}/><button type="button" className="text-link" onClick={()=>onChange({[field]:''})}>Remove {field==='logo'?'logo':'cover photo'}</button></>}</div>)}<label>Accent colour<input type="color" value={survey.accent||'#356b55'} onChange={e=>onChange({accent:e.target.value})}/></label></section>;
}
