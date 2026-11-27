import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordResetRepository } from '../db/namecheap-password-resets.mjs';
function fixture({ valid=true, fail=false }={}) {
  const calls=[];
  const execute=async(sql,values)=>{
    calls.push({sql,values});
    if(sql.startsWith('SELECT id FROM creator_users'))return [[{id:'u'}]];
    if(sql.includes('AND used=0 AND expires>'))return [valid?[{user_id:'u'}]:[]];
    if(fail&&sql.startsWith('DELETE FROM creator_sessions'))throw Error('session failure');
    return [[]];
  };
  const connection={execute,beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>calls.push('release')};
  return {calls,repo:passwordResetRepository({execute,getConnection:async()=>connection})};
}
const change={userId:'u',tokenHash:'hash',previousHash:'old',newHash:'new',salt:'salt'};

test('password reset locks user first and reevaluates expiry after locking reset row',async()=>{
  const f=fixture();assert.equal(await f.repo.consume(change),true);
  const sql=f.calls.filter(call=>typeof call==='object').map(call=>call.sql);
  assert.match(sql[0],/creator_users.*FOR UPDATE$/);
  assert.match(sql[1],/creator_password_resets.*FOR UPDATE$/);
  assert.match(sql[2],/CURRENT_TIMESTAMP\(3\)/);
  assert.match(sql[3],/^UPDATE creator_users/);
  assert.match(sql[4],/^UPDATE creator_password_resets/);
  assert.match(sql[5],/^DELETE FROM creator_sessions/);
  assert.equal(f.calls.at(-2),'commit');
});

test('invalid token cannot mutate password or sessions',async()=>{
  const f=fixture({valid:false});assert.equal(await f.repo.consume(change),false);
  assert.ok(!f.calls.some(call=>typeof call==='object'&&/^(UPDATE|DELETE)/.test(call.sql)));
});

test('failed revocation rolls the password and token writes back together',async()=>{
  const f=fixture({fail:true});await assert.rejects(f.repo.consume(change),/session failure/);
  assert.ok(f.calls.includes('rollback'));assert.ok(!f.calls.includes('commit'));
  assert.equal(f.calls.at(-1),'release');
});
