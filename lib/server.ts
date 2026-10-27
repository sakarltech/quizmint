import { env } from 'cloudflare:workers';
export function db() {if(!env.DB) throw new Error('Database unavailable'); return env.DB;}
export function response(data:unknown,status=200) {return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export function sameOrigin(req:Request) {const origin=req.headers.get('origin');const trusted=(env as any).QUIZMINT_RUNTIME==='namecheap'&&(env as any).APP_URL;return !origin || origin===(trusted?new URL(trusted).origin:new URL(req.url).origin);}
export async function administrator(req:Request):Promise<{id:string;email:string}|null> {
 if((env as any).QUIZMINT_RUNTIME==='namecheap'){
  // Pin an explicitly provisioned account id. Public registration with a chosen
  // email can never grant administrator rights.
  const id=(env as any).QUIZMINT_ADMIN_USER_ID;
  if(typeof id!=='string'||!id)return null;
  const {creator}=await import('./accounts');
  const user=await creator(req.headers.get('cookie'));
  return user?.id===id?{id:'admin:'+user.id,email:user.email}:null;
 }
 const email=(env as any).QUIZ_TEACHER_EMAIL;
 return email&&req.headers.get('oai-authenticated-user-id')&&req.headers.get('oai-authenticated-user-email')?.toLowerCase()===email.toLowerCase()
  ?{id:'admin:'+req.headers.get('oai-authenticated-user-id'),email:req.headers.get('oai-authenticated-user-email')!}:null;
}
export async function admin(req:Request){return !!await administrator(req);}
export function clientIp(req:Request){return (env as any).QUIZMINT_RUNTIME==='namecheap'?(req.headers.get('x-quizmint-client-ip')||'unknown'):(req.headers.get('cf-connecting-ip')||'unknown');}
export async function body(req:Request) {const raw=await req.text();if(raw.length>120000)throw new Error('Request too large.');return JSON.parse(raw);}
