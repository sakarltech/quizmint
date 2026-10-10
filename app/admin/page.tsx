import Teacher from '../teacher/teacher';
import {requireChatGPTUser,chatGPTSignOutPath} from '../chatgpt-auth';
import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
export default async function Page(){const user=await requireChatGPTUser('/admin');if(user.email.toLowerCase()!==((env as any).QUIZ_TEACHER_EMAIL||'').toLowerCase())return <main className="student-shell"><section className="start-card"><h1>Admin access only.</h1><p>Please sign in with the authorised OpenAI administrator account.</p><a className="btn" href={chatGPTSignOutPath('/admin')} target="_top">Switch account</a></section></main>;return <Teacher adminMode/>;}
