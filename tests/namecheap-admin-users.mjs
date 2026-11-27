import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {adminUserRepository} from '../db/namecheap-admin-users.mjs';

const sql=new DatabaseSync(':memory:');
sql.exec(`
 CREATE TABLE creator_users(id TEXT PRIMARY KEY,email TEXT,created TEXT,suspended_at INTEGER,suspension_reason TEXT);
 CREATE TABLE creator_profiles(user_id TEXT PRIMARY KEY,profile TEXT);
 CREATE TABLE ai_wallets(user_id TEXT PRIMARY KEY,free_remaining INTEGER,credits INTEGER,subscription_end INTEGER,free_period_start INTEGER);
 CREATE TABLE quizzes(id TEXT PRIMARY KEY,owner_id TEXT);
 CREATE TABLE attempts(id TEXT PRIMARY KEY,quiz_id TEXT);
 CREATE TABLE surveys(id TEXT PRIMARY KEY,owner_id TEXT);
 CREATE TABLE survey_responses(id TEXT PRIMARY KEY,survey_id TEXT);
 CREATE TABLE creator_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);
 CREATE TABLE admin_audit_log(id TEXT PRIMARY KEY,admin_id TEXT,target_user_id TEXT,action TEXT,detail TEXT,created INTEGER);
`);
const execute=async(query,values=[])=>{
 const adapted=query.replace(/ FOR UPDATE$/,'').replace(/\bGREATEST\(/g,'MAX(').replace(' ON DUPLICATE KEY UPDATE user_id=user_id',' ON CONFLICT(user_id) DO NOTHING');
 const statement=sql.prepare(adapted);
 return query.trimStart().startsWith('SELECT')?[statement.all(...values)]:[statement.run(...values)];
};
const pool={execute,getConnection:async()=>({execute,beginTransaction:async()=>sql.exec('BEGIN'),commit:async()=>sql.exec('COMMIT'),rollback:async()=>sql.exec('ROLLBACK'),release(){}})};
sql.prepare('INSERT INTO creator_users VALUES(?,?,?,?,?)').run('admin','admin@example.test','2026-01-01',null,null);
sql.prepare('INSERT INTO creator_users VALUES(?,?,?,?,?)').run('creator','creator@example.test','2026-01-02',null,null);
sql.prepare('INSERT INTO creator_profiles VALUES(?,?)').run('creator',JSON.stringify({name:'Casey Creator'}));
sql.prepare('INSERT INTO ai_wallets VALUES(?,?,?,?,?)').run('creator',12,8,Date.now()+60000,0);
sql.prepare('INSERT INTO quizzes VALUES(?,?)').run('q','creator');
sql.prepare('INSERT INTO attempts VALUES(?,?)').run('a','q');
sql.prepare('INSERT INTO surveys VALUES(?,?)').run('s','creator');
sql.prepare('INSERT INTO survey_responses VALUES(?,?)').run('r','s');
sql.prepare('INSERT INTO creator_sessions VALUES(?,?,?)').run('token','creator',Date.now()+60000);

const repo=adminUserRepository(pool),page=await repo.list('casey',0);
assert.equal(page.total,1);assert.equal(page.users[0].email,'creator@example.test');
assert.deepEqual([page.users[0].quizzes,page.users[0].submissions,page.users[0].surveys,page.users[0].survey_responses],[1,1,1,1]);
await repo.update({adminId:'admin',userId:'creator',action:'signout'});
assert.equal(sql.prepare('SELECT COUNT(*) n FROM creator_sessions').get().n,0);
assert.equal(sql.prepare('SELECT action FROM admin_audit_log').get().action,'signout');
await assert.rejects(repo.update({adminId:'admin',userId:'admin',action:'suspend'}),/not available/);
sql.close();
console.log('Namecheap admin user checks passed: profile search, full activity visibility, pagination metadata, session sign-out, audit logging and self-protection.');
