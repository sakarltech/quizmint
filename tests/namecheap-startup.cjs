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
