import Teacher from '../teacher/teacher';
import {requireChatGPTUser,chatGPTSignOutPath} from '../chatgpt-auth';
import {env} from 'cloudflare:workers';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {creator} from '../../lib/accounts';
import {admin} from '../../lib/server';
export const dynamic='force-dynamic';
export default async function Page(){
 if((env as any).QUIZMINT_RUNTIME==='namecheap'){
  const h=await headers();if(!await creator(h.get('cookie')))redirect('/login?next=admin');
  if(!await admin(new Request('https://quizmint.internal/admin',{headers:new Headers(h)})))return <main className="student-shell"><section className="start-card"><h1>Admin access required.</h1><p>This account is not authorised to administer QuizMint.</p><a className="btn" href="/teacher">Creator dashboard</a></section></main>;
  return <Teacher adminMode/>;
 }
 const user=await requireChatGPTUser('/admin');if(user.email.toLowerCase()!==((env as any).QUIZ_TEACHER_EMAIL||'').toLowerCase())return <main className="student-shell"><section className="start-card"><h1>Admin access only.</h1><p>Please sign in with the authorised OpenAI administrator account.</p><a className="btn" href={chatGPTSignOutPath('/admin')} target="_top">Switch account</a></section></main>;return <Teacher adminMode/>;
}
