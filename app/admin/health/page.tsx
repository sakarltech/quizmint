import {requireChatGPTUser} from '../../chatgpt-auth';
import {env} from 'cloudflare:workers';
import Health from './health';
export const dynamic='force-dynamic';
export default async function Page(){const user=await requireChatGPTUser('/admin/health');if(user.email.toLowerCase()!==((env as any).QUIZ_TEACHER_EMAIL||'').toLowerCase())return <main className="student-shell"><h1>Admin access required.</h1></main>;return <Health/>;}
