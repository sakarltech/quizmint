import {requireChatGPTUser} from '../../chatgpt-auth';
import {env} from 'cloudflare:workers';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {creator} from '../../../lib/accounts';
import {admin} from '../../../lib/server';
import Health from './health';
export const dynamic='force-dynamic';
export default async function Page(){
 if((env as any).QUIZMINT_RUNTIME==='namecheap'){
  const h=await headers();if(!await creator(h.get('cookie')))redirect('/login?next=admin-health');
  if(!await admin(new Request('https://quizmint.internal/admin/health',{headers:new Headers(h)})))return <main className="student-shell"><h1>Admin access required.</h1></main>;
  return <Health/>;
 }
 const user=await requireChatGPTUser('/admin/health');if(user.email.toLowerCase()!==((env as any).QUIZ_TEACHER_EMAIL||'').toLowerCase())return <main className="student-shell"><h1>Admin access required.</h1></main>;return <Health/>;
}
