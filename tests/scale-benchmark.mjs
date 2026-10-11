import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
const db=new DatabaseSync(':memory:');db.exec(readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync('drizzle/'+f,'utf8')).join('\n').replaceAll('--> statement-breakpoint',''));
db.exec('BEGIN');const user=db.prepare('INSERT INTO creator_users VALUES(?,?,?,?,?)'),quiz=db.prepare('INSERT INTO quizzes VALUES(?,?,?,?,?,?,?,?)'),attempt=db.prepare('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)');
for(let i=0;i<100000;i++){user.run('u'+i,'user'+i+'@synthetic.test','unused','unused','2026-01-01');quiz.run('q'+i,'Synthetic quiz','Testing','Synthetic only','[]',1,'2026-01-01','u'+Math.floor(i/100));}
for(let i=0;i<250000;i++)attempt.run('a'+i,'q'+(i%100000),'synthetic@example.test',1,1,'{}','2026-01-01');db.exec('COMMIT');
const query="WITH page AS (SELECT q.* FROM quizzes q WHERE q.owner_id=? ORDER BY q.created DESC,q.id DESC LIMIT 26 OFFSET ?) SELECT q.id,(SELECT COUNT(*) FROM attempts a WHERE a.quiz_id=q.id) submissions FROM page q";
const times=[];for(let i=0;i<100;i++){const start=performance.now();const rows=db.prepare(query).all('u'+(i%1000),i%4*25);times.push(performance.now()-start);assert.ok(rows.length<=26);}
const plan=db.prepare('EXPLAIN QUERY PLAN '+query).all('u1',0).map(r=>r.detail).join('\n');assert.ok(plan.includes('quiz_owner_created_idx'));assert.ok(plan.includes('attempt_quiz_created_idx'));
times.sort((a,b)=>a-b);console.log(JSON.stringify({scope:'Local in-memory SQLite query benchmark; not a hosted concurrency test',creators:100000,quizzes:100000,submissions:250000,queryRuns:100,p50Milliseconds:+times[49].toFixed(3),p95Milliseconds:+times[94].toFixed(3),maxMilliseconds:+times[99].toFixed(3),indexesVerified:true}));db.close();
