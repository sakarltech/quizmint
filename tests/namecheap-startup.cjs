const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { start } = require('../server.cjs');

test('production startup prepares Next and uses the hosting port', async () => {
  let options, handler, port, prepared = false;
  const server = new EventEmitter();
  server.listen = (value, ready) => { port = value; ready(); };
  const app = { prepare: async () => { prepared = true; }, getRequestHandler: () => () => {} };
  const result = await start({
    env: { NODE_ENV: 'production', PORT: '4321' },
    next: value => { options = value; return app; },
    http: value => { assert.ok(prepared); handler = value; return server; },
  });
  assert.equal(options.dev, false);
  assert.equal(options.dir, require('node:path').resolve(__dirname, '..'));
  assert.equal(typeof handler, 'function');
  assert.equal(port, 4321);
  assert.equal(result.server, server);
});

test('startup rejects invalid ports and preparation failures', async () => {
  for (const PORT of ['0', '65536', 'bad']) {
    await assert.rejects(start({ next: () => assert.fail('should not initialize'), env: { PORT } }), /PORT/);
  }
  await assert.rejects(start({ next: () => ({ prepare: async () => { throw new Error('build missing'); } }), env: {} }), /build missing/);
});

test('startup propagates listen failure instead of reporting success', async () => {
  const server = new EventEmitter();
  server.listen = () => server.emit('error', new Error('address unavailable'));
  await assert.rejects(start({
    env: {},
    next: () => ({ prepare: async () => {}, getRequestHandler: () => () => {} }),
    http: () => server,
  }), /address unavailable/);
});

test('Passenger require-loader starts the app; ordinary module imports stay inert', async () => {
  const { readFileSync } = require('node:fs');
  const { runInNewContext } = require('node:vm');
  const source = readFileSync(require.resolve('../server.cjs'), 'utf8');
  for (const passenger of [false, true]) {
    let prepared = 0, listens = 0;
    const server = new EventEmitter();
    server.listen = (port, ready) => { listens++; assert.equal(port, 3000); ready(); };
    const next = () => ({ prepare: async () => { prepared++; }, getRequestHandler: () => () => {} });
    const fakeRequire = name => name === 'node:http' ? { createServer: () => server } : name === 'next' ? next : require(name === './lib/namecheap-request.cjs' ? '../lib/namecheap-request.cjs' : name);
    fakeRequire.main = {}; // Passenger's loader is the main module.
    const errors = [], sandbox = {
      require: fakeRequire, module: { exports: {} }, __dirname: require('node:path').resolve(__dirname, '..'), URL,
      process: { env: { NODE_ENV: 'production', APP_URL: 'https://staging.quizmint.co.uk' }, chdir() {}, exitCode: undefined },
      console: { log() {}, error(message) { errors.push(message); } },
    };
    sandbox.global = sandbox;
    if (passenger) sandbox.PhusionPassenger = { options: {} };
    runInNewContext(source, sandbox, { filename: 'server.cjs' });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(errors, []);
    assert.equal(prepared, passenger ? 1 : 0);
    assert.equal(listens, passenger ? 1 : 0);
    assert.equal(typeof sandbox.module.exports.start, 'function');
  }
});
