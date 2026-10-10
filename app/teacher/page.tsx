import Teacher from './teacher';
import {creator} from '../../lib/accounts';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page(){const user=await creator((await headers()).get('cookie'));if(!user)redirect('/login');return <Teacher/>;}
