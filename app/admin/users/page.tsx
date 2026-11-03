import {env} from 'cloudflare:workers';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {creator} from '../../../lib/accounts';
import {admin} from '../../../lib/server';
import Users from './users';
export const dynamic='force-dynamic';
export default async function Page(){if((env as any).QUIZMINT_RUNTIME!=='namecheap')return <main className="student-shell"><h1>User management is available on the hosted runtime only.</h1></main>;const h=await headers();if(!await creator(h.get('cookie')))redirect('/login?next=admin-users');if(!await admin(new Request('https://quizmint.internal/admin/users',{headers:new Headers(h)})))return <main className="student-shell"><h1>Admin access required.</h1></main>;return <Users/>;}
