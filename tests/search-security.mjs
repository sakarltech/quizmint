import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { sameOrigin, secureResponse } from '../lib/request-security.mjs';

const db = new DatabaseSync(':memory:');
for (const name of ['0000_dapper_ares.sql', '0001_spooky_whistler.sql', '0002_jazzy_the_twelve.sql', '0003_tiresome_pretty_boy.sql', '0004_tiresome_typhoid_mary.sql', '0005_arena_qa_cleanup.sql', '0006_big_glorian.sql', '0007_cultured_joseph.sql']) {
  db.exec(readFileSync('drizzle/' + name, 'utf8').replaceAll('--> statement-breakpoint', ''));
}
db.prepare('INSERT INTO public_quizzes(id,owner_id,title,subject,quiz,published,created) VALUES(?,?,?,?,?,?,?)').run('old','owner','Historic botany','Biology','{}',1,1);
db.exec(readFileSync('drizzle/0008_cuddly_gwen_stacy.sql', 'utf8').replaceAll('--> statement-breakpoint', ''));
const search = term => db.prepare('SELECT rowid FROM public_quiz_search WHERE public_quiz_search MATCH ?').all(term);
assert.equal(search('botany').length, 0, 'Reproduce missing pre-migration index entry');
db.exec(readFileSync('drizzle/0011_rebuild_public_quiz_search.sql', 'utf8'));
assert.equal(search('botany').length, 1, 'Existing public quiz is indexed');
db.prepare('UPDATE public_quizzes SET title=? WHERE id=?').run('Modern astronomy','old');
assert.equal(search('botany').length, 0);
assert.equal(search('astronomy').length, 1, 'Triggers continue to update rebuilt index');
db.prepare('DELETE FROM public_quizzes WHERE id=?').run('old');
assert.equal(search('astronomy').length, 0, 'Triggers continue to delete rebuilt entries');
db.close();

const url = 'https://quiz.example/api/account';
const request = headers => new Request(url, {method:'POST', headers});
assert.equal(sameOrigin(request({Origin:'https://quiz.example'})), true);
assert.equal(sameOrigin(request({Referer:'https://quiz.example/teacher'})), true);
assert.equal(sameOrigin(request({})), false);
assert.equal(sameOrigin(request({Origin:'https://evil.example', Referer:'https://quiz.example/'})), false);
assert.equal(sameOrigin(request({Origin:'null'})), false);
assert.equal(sameOrigin(request({Referer:'not a URL'})), false);
assert.equal(sameOrigin(request({Referer:'https://evil.example/'})), false);
assert.equal(sameOrigin(request({Origin:'https://quiz.example','Sec-Fetch-Site':'cross-site'})), false);
assert.equal(sameOrigin(request({Origin:'https://quiz.example','Sec-Fetch-Site':'same-site'})), false);
const secured = secureResponse(request({}), new Response('ok', {headers:{'Set-Cookie':'session=value; HttpOnly'}}));
assert.match(secured.headers.get('content-security-policy'), /frame-ancestors 'self'/);
assert.match(secured.headers.get('content-security-policy'), /fonts\.googleapis\.com/);
assert.equal(secured.headers.get('strict-transport-security'), 'max-age=31536000');
assert.equal(secured.headers.get('x-frame-options'), 'SAMEORIGIN');
assert.equal(secured.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
assert.equal(secured.headers.get('set-cookie'), 'session=value; HttpOnly');
assert.equal(await secured.text(), 'ok');
const image = secureResponse(request({}), new Response('image', {headers:{'Content-Security-Policy':"default-src 'none'"}}));
assert.equal(image.headers.get('content-security-policy'), "default-src 'none'");
const dev = secureResponse(new Request('http://localhost/'), new Response('ok'), true);
assert.equal(dev.headers.get('content-security-policy'), null);
assert.equal(dev.headers.get('strict-transport-security'), null);
console.log('Passed: legacy search backfill and trigger maintenance, origin checks and response security headers.');
