import Home from './home';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {env} from 'cloudflare:workers';
import {creator} from '../lib/accounts';
import {administrator} from '../lib/server';
export const dynamic='force-dynamic';
export default async function Page(){
 if((env as any).QUIZMINT_RUNTIME==='namecheap'){
  const requestHeaders=await headers();
  if(await creator(requestHeaders.get('cookie'))){
   if(await administrator(new Request('https://quizmint.internal/admin',{headers:new Headers(requestHeaders)})))redirect('/admin');
   redirect('/teacher');
  }
 }
 return <Home/>;
}
