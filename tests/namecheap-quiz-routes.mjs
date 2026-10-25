import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { quizTestTables } from '../db/namecheap-quiz-test-tables.mjs';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
const sql = new DatabaseSync(':memory:');
for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + file, 'utf8'));
let failDelete = false, queryCount = 0;
const execute = async (query, values = []) => {
  queryCount++;
  const mapped = quizTestTables('abcdef123456').sql(query);
  if (/\b(quizzes|attempts|quiz_sessions|public_quizzes)\b/.test(query)) {
    assert.doesNotMatch(mapped, /\b(quizzes|attempts|quiz_sessions|public_quizzes)\b/);
  }
  if (failDelete && query.startsWith('DELETE FROM public_quizzes')) throw Error('Synthetic delete failure');
  const adapted = query.replace(/ FOR UPDATE$/, '').replace(/ ON DUPLICATE KEY UPDATE id=id$/, ' ON CONFLICT(id) DO NOTHING');
  const statement = sql.prepare(adapted);
  return /^(SELECT|WITH)/.test(query) ? [statement.all(...values)] : [statement.run(...values)];
};
globalThis.__quizPool = { execute, getConnection: async () => ({ execute, beginTransaction: async () => sql.exec('BEGIN'), commit: async () => sql.exec('COMMIT'), rollback: async () => sql.exec('ROLLBACK'), release() {} }) };
globalThis.__quizEnv = { QUIZMINT_RUNTIME: 'namecheap', DB: { prepare() { throw Error('D1 must not be used.'); } } };
const previous = Object.fromEntries(['DB_NAME', 'DB_USER', 'DB_PASSWORD'].map(key => [key, process.env[key]]));
Object.assign(process.env, { DB_NAME: 'isolated_test', DB_USER: 'test', DB_PASSWORD: 'test-only' });
try {
  const plugin = { name: 'quiz-test-runtime', setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'fixture' }));
    builder.onResolve({ filter: /^mysql2\/promise$/ }, () => ({ path: 'mysql', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'env' ? 'export const env=globalThis.__quizEnv' : 'export const createPool=()=>globalThis.__quizPool', loader: 'js' }));
  } };
  await build({ entryPoints: ['app/api/teacher/route.ts', 'app/api/quiz/[id]/route.ts'], outdir: '.sites-runtime/namecheap-quiz-routes', outbase: '.', bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, plugins: [plugin] });
  const teacher = await import('../.sites-runtime/namecheap-quiz-routes/app/api/teacher/route.mjs');
  const student = await import('../.sites-runtime/namecheap-quiz-routes/app/api/quiz/[id]/route.mjs');
  const root = 'https://quizmint.test';
  const hash = value => createHash('sha256').update(value).digest('hex');
  for (const [id, token] of [['owner', 'a'.repeat(64)], ['other', 'b'.repeat(64)]]) {
    sql.prepare('INSERT INTO creator_users VALUES(?,?,?,?,?)').run(id, id + '@example.test', 'hash', 'salt', 'now');
    sql.prepare('INSERT INTO creator_sessions VALUES(?,?,?)').run(hash(token), id, Date.now() + 60000);
  }
  const req = (path, method = 'GET', data, token = 'a'.repeat(64), origin = root) => new Request(root + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Cookie: '__Host-quiz_session=' + token } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const draft = { title: 'Quiz check', subject: 'Maths', description: 'Test', questions: [{ prompt: 'Two plus two?', options: ['1', '2', '3', '4'], correct: 3, explanation: 'Four.' }] };
  assert.equal((await teacher.POST(req('/api/teacher', 'POST', draft, ''))).status, 401);
  assert.equal((await teacher.POST(req('/api/teacher', 'POST', draft, undefined, 'https://evil.test'))).status, 403);
  const created = await teacher.POST(req('/api/teacher', 'POST', draft));
  assert.equal(created.status, 201, await created.clone().text());
  const { id } = await created.json();
  const params = { params: Promise.resolve({ id }) };
  assert.equal((await (await teacher.GET(req('/api/teacher'))).json()).quizzes.length, 1);
  assert.equal((await (await teacher.GET(req('/api/teacher', 'GET', undefined, 'b'.repeat(64)))).json()).quizzes.length, 0);
  assert.equal((await teacher.GET(req('/api/teacher?results=' + id, 'GET', undefined, 'b'.repeat(64)))).status, 404);
  assert.equal((await teacher.PATCH(req('/api/teacher', 'PATCH', { id, active: false }, 'b'.repeat(64)))).status, 404);
  const publicQuiz = await (await student.GET(req('/api/quiz/' + id), params)).json();
  assert.ok(!('correct' in publicQuiz.questions[0]));
  assert.ok(!('explanation' in publicQuiz.questions[0]));
  const attemptId = crypto.randomUUID();
  const submission = { student: 'student@example.test', answers: [3], attemptId };
  assert.equal((await student.POST(req('/api/quiz/' + id, 'POST', { ...submission, answers: [] }), params)).status, 400);
  const result = await (await student.POST(req('/api/quiz/' + id, 'POST', submission), params)).json();
  assert.equal(result.score, 1);
  const retry = await (await student.POST(req('/api/quiz/' + id, 'POST', { ...submission, answers: [0] }), params)).json();
  assert.equal(retry.score, 1);
  const reports = await (await teacher.GET(req('/api/teacher?results=' + id))).json();
  assert.equal(reports.attempts.length, 1);
  assert.equal(reports.quizzes[0].average, 100);
  await teacher.PATCH(req('/api/teacher', 'PATCH', { id, active: false }));
  assert.equal((await student.GET(req('/api/quiz/' + id), params)).status, 410);
  assert.equal((await student.POST(req('/api/quiz/' + id, 'POST', submission), params)).status, 410);
  assert.equal((await teacher.DELETE(req('/api/teacher?id=' + id, 'DELETE', undefined, 'b'.repeat(64)))).status, 404);
  failDelete = true;
  await assert.rejects(teacher.DELETE(req('/api/teacher?id=' + id, 'DELETE')), /Synthetic/);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM attempts WHERE quiz_id=?').get(id).n, 1);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM quizzes WHERE id=?').get(id).n, 1);
  failDelete = false;
  assert.equal((await teacher.DELETE(req('/api/teacher?id=' + id, 'DELETE'))).status, 200);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM attempts').get().n, 0);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM quizzes').get().n, 0);
  assert.ok(queryCount > 0);
  console.log('Namecheap quiz route checks passed: ownership, saving, hidden answers, grading, retry deduplication, results, closed quizzes and transactional deletion. No D1 access.');
} finally {
  for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  sql.close();
}
