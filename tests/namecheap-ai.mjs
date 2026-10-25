import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiRepository } from '../db/namecheap-ai.mjs';
import { exerciseAiStore } from './helpers/namecheap-ai-checks.mjs';
import { aiDriverFixture } from './helpers/namecheap-ai-driver.mjs';

test('wallet/job/payment scenarios preserve balances and transaction rollback',async()=>{
  const fixture=aiDriverFixture();try{await exerciseAiStore({...fixture,store:aiRepository(fixture.pool)});}finally{fixture.close();}
});

test('duplicate payment deliveries in parallel grant credits once',async()=>{
  const f=aiDriverFixture();try{
    const store=aiRepository(f.pool),payment={userId:'parallel',sessionId:'cs_parallel',questions:50,customer:'cus_test',periodStart:1000,now:2000};
    const results=await Promise.all(Array.from({length:8},()=>store.fulfilPayment(payment)));
    assert.equal(results.filter(Boolean).length,1);
    assert.equal((await store.wallet('parallel',1000)).credits,50);
  }finally{f.close();}
});

test('parallel reservations spend at most one request and reject invalid amounts',async()=>{
  const f=aiDriverFixture();try{
    const store=aiRepository(f.pool);
    const results=await Promise.all(Array.from({length:8},(_,i)=>store.reserve({userId:'creator',jobId:'job-'+i,free:5,paid:0,periodStart:1000,now:2000})));
    assert.equal(results.filter(Boolean).length,1);
    assert.equal((await store.wallet('creator',1000)).free_remaining,15);
    await assert.rejects(store.reserve({userId:'creator',jobId:'bad',free:-1,paid:0,periodStart:1000,now:2000}),/Invalid/);
  }finally{f.close();}
});
