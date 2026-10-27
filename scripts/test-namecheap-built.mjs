// Read-only smoke check of an existing standard Next production build.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
const require = createRequire(import.meta.url), { start } = require('../lib/namecheap-server.cjs');
const keys = ['NODE_ENV','PORT','APP_URL','QUIZMINT_ADMIN_USER_ID','QUIZMINT_TRUST_PROXY','DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD'];
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
Object.assign(process.env, { NODE_ENV:'production',PORT:'3197',APP_URL:'https://quizmint.test',QUIZMINT_ADMIN_USER_ID:'',QUIZMINT_TRUST_PROXY:'',DB_HOST:'127.0.0.1',DB_PORT:'1',DB_NAME:'no_database',DB_USER:'no_user',DB_PASSWORD:'no_password' });
let active;
try {
  active = await start({ http:handler=>{
    const server=createServer(handler), listen=server.listen.bind(server);
    server.listen=(port,ready)=>listen(port,'127.0.0.1',ready);
    return server;
  }});
  const root='http://127.0.0.1:3197';
  for(const path of ['/','/login','/help','/privacy','/terms'])assert.equal((await fetch(root+path)).status,200,path);
  const forged={'oai-authenticated-user-id':'pretend-admin','oai-authenticated-user-email':'admin@example.test','x-quizmint-client-ip':'1.2.3.4','cf-connecting-ip':'2.3.4.5'};
  assert.equal((await fetch(root+'/api/admin',{headers:forged})).status,401);
  assert.equal((await fetch(root+'/api/platform',{headers:forged})).status,403);
  assert.equal((await fetch(root+'/api/account')).status,401);
  const page=await fetch(root+'/admin',{headers:forged,redirect:'manual'});
  assert.equal(page.status,307);assert.ok(page.headers.get('location').includes('/login?next=admin'));
  const blocked=await fetch(root+'/api/account',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:'{}'});
  assert.equal(blocked.status,403);
  console.log('Namecheap production smoke check passed: public pages, local login redirect, anonymous/API denial, forged-header rejection and origin protection. No database or provider calls.');
} finally {
  if(active){active.server.closeAllConnections();await new Promise(resolve=>active.server.close(resolve));await active.app.close();}
  for(const [key,value] of Object.entries(previous))value===undefined?delete process.env[key]:process.env[key]=value;
}
