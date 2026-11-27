import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { aiDriverFixture } from './helpers/namecheap-ai-driver.mjs';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const fixture=aiDriverFixture(),secret='whsec_synthetic_test';
globalThis.__billingPool=fixture.pool;
globalThis.__billingEnv={QUIZMINT_RUNTIME:'namecheap',STRIPE_WEBHOOK_SECRET:secret,STRIPE_SECRET_KEY:'sk_test_synthetic',DB:{prepare(){throw Error('D1 must not be used.');}}};
const previous=Object.fromEntries(['DB_NAME','DB_USER','DB_PASSWORD'].map(key=>[key,process.env[key]]));
Object.assign(process.env,{DB_NAME:'isolated_billing_test',DB_USER:'test',DB_PASSWORD:'test-only'});
const originalFetch=globalThis.fetch;
try {
  const plugin={name:'billing-runtime',setup(builder){
    builder.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));
    builder.onResolve({filter:/^mysql2\/promise$/},()=>({path:'mysql',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='env'?'export const env=globalThis.__billingEnv':'export const createPool=()=>globalThis.__billingPool',loader:'js'}));
  }};
  await build({entryPoints:['app/api/ai/webhook/route.ts'],outfile:'.sites-runtime/namecheap-billing-route.mjs',bundle:true,platform:'node',format:'esm',plugins:[plugin]});
  const route=await import('../.sites-runtime/namecheap-billing-route.mjs');
  const call=(object,type='checkout.session.completed',valid=true)=>{
    const raw=JSON.stringify({id:'evt_test',type,data:{object}}),timestamp=Math.floor(Date.now()/1000);
    const signature=createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');
    return route.POST(new Request('https://quizmint.test/api/ai/webhook',{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${valid?signature:'invalid'}`},body:raw}));
  };
  const payment={id:'cs_fixture',mode:'payment',payment_status:'paid',amount_total:299,currency:'gbp',customer:'cus_fixture',metadata:{plan:'starter',user_id:'creator'}};
  assert.equal((await call(payment,undefined,false)).status,400);
  assert.equal((await call({...payment,payment_status:'unpaid'})).status,200);
  assert.equal(fixture.sql.prepare('SELECT COUNT(*) n FROM ai_payments').get().n,0);
  const repeated=await Promise.all(Array.from({length:8},()=>call(payment)));
  assert.ok(repeated.every(response=>response.status===200));
  assert.equal(fixture.sql.prepare('SELECT credits FROM ai_wallets WHERE user_id=?').get('creator').credits,50);
  assert.equal((await call(payment,'checkout.session.async_payment_succeeded')).status,200);
  assert.equal(fixture.sql.prepare('SELECT credits FROM ai_wallets WHERE user_id=?').get('creator').credits,50);
  assert.equal((await call({...payment,id:'cs_bad',amount_total:1})).status,500);
  assert.equal((await call({...payment,metadata:{plan:'starter',user_id:'other'}})).status,500);
  assert.equal(fixture.sql.prepare('SELECT credits FROM ai_wallets WHERE user_id=?').get('other').credits,0);
  fixture.failNextPayment();
  assert.equal((await call({...payment,id:'cs_retry'})).status,500);
  assert.equal(fixture.sql.prepare('SELECT COUNT(*) n FROM ai_payments WHERE id=?').get('cs_retry').n,0);
  assert.equal((await call({...payment,id:'cs_retry'})).status,200);
  assert.equal(fixture.sql.prepare('SELECT credits FROM ai_wallets WHERE user_id=?').get('creator').credits,100);
  const end=Math.floor(Date.now()/1000)+3600;
  globalThis.fetch=async url=>{assert.equal(url,'https://api.stripe.com/v1/subscriptions/sub_fixture');return Response.json({id:'sub_fixture',metadata:{plan:'monthly',user_id:'creator'},status:'active',customer:'cus_fixture',current_period_end:end});};
  assert.equal((await call({subscription:'sub_fixture'},'invoice.paid')).status,200);
  assert.equal(fixture.sql.prepare('SELECT subscription_end FROM ai_wallets WHERE user_id=?').get('creator').subscription_end,end*1000);
  assert.equal((await call({metadata:{user_id:'creator'},customer:'wrong_customer'},'customer.subscription.deleted')).status,200);
  assert.equal(fixture.sql.prepare('SELECT subscription_end FROM ai_wallets WHERE user_id=?').get('creator').subscription_end,end*1000);
  assert.equal((await call({metadata:{user_id:'creator'},customer:'cus_fixture'},'customer.subscription.deleted')).status,200);
  assert.equal(fixture.sql.prepare('SELECT subscription_end FROM ai_wallets WHERE user_id=?').get('creator').subscription_end,0);
  console.log('Namecheap billing route checks passed: signed webhooks, unpaid isolation, replay/concurrent deduplication, amount checks, ownership, rollback/retry and subscriptions. No D1 or live Stripe calls.');
} finally {
  globalThis.fetch=originalFetch;
  for(const [key,value] of Object.entries(previous))value===undefined?delete process.env[key]:process.env[key]=value;
  fixture.close();
}
