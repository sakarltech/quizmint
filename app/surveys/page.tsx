import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {creator} from '../../lib/accounts';
import SurveyDashboard from './survey-dashboard';
import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
export default async function Page(){if(!await creator((await headers()).get('cookie')))redirect('/login?next=surveys');if((env as any).QUIZMINT_RUNTIME==='namecheap')return <main className="student-shell"><section className="start-card"><h1>Surveys are coming soon.</h1><p>Survey creation and responses are not yet available on this version of QuizMint.</p><a className="btn" href="/teacher">Back to dashboard</a></section></main>;return <SurveyDashboard/>;}
