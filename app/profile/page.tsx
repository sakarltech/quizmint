import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {creator} from '../../lib/accounts';
import ProfileEditor from './profile-editor';
export const dynamic='force-dynamic';
export default async function Page(){if(!await creator((await headers()).get('cookie')))redirect('/login');return <ProfileEditor/>;}
