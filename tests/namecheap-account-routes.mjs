// Route-level test: real account repository with an isolated driver fixture.
// SQL compatibility itself is covered by db:test-accounts:namecheap on MariaDB.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
const sql = new DatabaseSync(':memory:');
for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + file, 'utf8'));
let queries = 0;
const execute = async (query, values = []) => {
  queries++;
  const adapted = query.replace(/ FOR UPDATE$/, '').replace(/ ON DUPLICATE KEY UPDATE `key`=VALUES\(`key`\)$/, ' ON CONFLICT(`key`) DO NOTHING');
  try {
    const statement = sql.prepare(adapted);
    return /^SELECT/.test(query) ? [statement.all(...values)] : [statement.run(...values)];
  } catch (error) {
    if (/UNIQUE constraint/.test(error.message)) error.code = 'ER_DUP_ENTRY';
    throw error;
  }
};
globalThis.__accountPool = {
  execute,
  getConnection: async () => ({ execute, beginTransaction: async () => sql.exec('BEGIN'), commit: async () => sql.exec('COMMIT'), rollback: async () => sql.exec('ROLLBACK'), release() {} }),
};
globalThis.__accountEnv = { QUIZMINT_RUNTIME: 'namecheap', DB: { prepare() { throw Error('D1 must not be used.'); } } };
const previous = Object.fromEntries(['DB_NAME', 'DB_USER', 'DB_PASSWORD'].map(key => [key, process.env[key]]));
Object.assign(process.env, { DB_NAME: 'isolated_test', DB_USER: 'test', DB_PASSWORD: 'test-only' });
try {
  const plugin = { name: 'account-test-runtime', setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'fixture' }));
    builder.onResolve({ filter: /^mysql2\/promise$/ }, () => ({ path: 'mysql', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'env' ? 'export const env=globalThis.__accountEnv' : 'export const createPool=()=>globalThis.__accountPool', loader: 'js' }));
  } };
  await build({ entryPoints: ['app/api/account/route.ts'], outfile: '.sites-runtime/namecheap-account-routes.mjs', bundle: true, platform: 'node', format: 'esm', plugins: [plugin] });
  const route = await import('../.sites-runtime/namecheap-account-routes.mjs');
  const root = 'https://quizmint.test';
  const request = (method, data, cookie, origin = root) => new Request(root + '/api/account', { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  assert.equal((await route.GET(request('GET'))).status, 401);
  assert.equal((await route.POST(request('POST', { action: 'register', email: 'bad', password: 'secure-password-123' }))).status, 400);
  assert.equal((await route.POST(request('POST', {}, undefined, 'https://evil.test'))).status, 403);
  const body = { action: 'register', email: 'Creator@Example.test', password: 'secure-password-123' };
  const registration = await route.POST(request('POST', body));
  assert.equal(registration.status, 200, await registration.text());
  const header = registration.headers.get('set-cookie');
  assert.match(header, /HttpOnly; Secure; SameSite=Lax/);
  const cookie = header.split(';')[0];
  const stored = sql.prepare('SELECT * FROM creator_users').get();
  assert.equal(stored.email, 'creator@example.test');
  assert.notEqual(stored.password_hash, body.password);
  assert.equal(stored.password_hash.length, 64);
  assert.equal((await route.POST(request('POST', body))).status, 400);
  assert.equal((await route.POST(request('POST', { ...body, action: 'login', password: 'wrong-password' }))).status, 401);
  assert.equal((await route.POST(request('POST', { ...body, action: 'login' }))).status, 200);
  assert.deepEqual(await (await route.GET(request('GET', undefined, cookie))).json(), { email: 'creator@example.test' });
  assert.equal((await route.DELETE(request('DELETE', undefined, cookie, 'https://evil.test'))).status, 403);
  assert.equal((await route.DELETE(request('DELETE', undefined, cookie))).status, 200);
  assert.equal((await route.GET(request('GET', undefined, cookie))).status, 401);
  const loggedIn = await route.POST(request('POST', { ...body, action: 'login' }));
  const expiringCookie = loggedIn.headers.get('set-cookie').split(';')[0];
  sql.prepare('UPDATE creator_sessions SET expires=0').run();
  assert.equal((await route.GET(request('GET', undefined, expiringCookie))).status, 401);
  let result;
  for (let n = 0; n < 13; n++) result = await route.POST(request('POST', { action: 'login', email: 'limit@example.test', password: 'incorrect-password' }));
  assert.equal(result.status, 429);
  assert.ok(queries > 0);
  console.log('Namecheap account route checks passed: MariaDB selection without D1, registration, password hashing, login, cookies, sessions, expiry, sign-out, origin protection and rate limits.');
} finally {
  for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  sql.close();
}
