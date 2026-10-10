import { env } from 'cloudflare:workers';
export function db() {if(!env.DB) throw new Error('Database unavailable'); return env.DB;}
export function response(data:unknown,status=200) {return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export function sameOrigin(req:Request) {const origin=req.headers.get('origin');return !origin || origin===new URL(req.url).origin;}
export async function admin(req:Request) {
 const email=(env as any).QUIZ_TEACHER_EMAIL;
 return Boolean(email && req.headers.get('oai-authenticated-user-id') && req.headers.get('oai-authenticated-user-email')?.toLowerCase()===email.toLowerCase());
}
export async function body(req:Request) {const raw=await req.text();if(raw.length>120000)throw new Error('Request too large.');return JSON.parse(raw);}
