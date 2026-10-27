const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { start } = require('../lib/namecheap-server.cjs');

test('production startup prepares Next and uses the hosting port', async () => {
  let options, handler, port, prepared = false;
  const server = new EventEmitter();
  server.listen = (value, ready) => { port = value; ready(); };
  const app = { prepare: async () => { prepared = true; }, getRequestHandler: () => () => {} };
  const result = await start({
    env: { NODE_ENV: 'production', PORT: '4321' },
    next: value => { options = value; return app; },
    http: value => { assert.equal(prepared,false); handler = value; return server; },
  });
  assert.equal(prepared, true);
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
  const server = new EventEmitter();server.listen=(_port,ready)=>ready();let closed=false;server.close=done=>{closed=true;done();};
  await assert.rejects(start({ next: () => ({ prepare: async () => { throw new Error('build missing'); } }), env: {}, http:()=>server }), /build missing/);
  assert.equal(closed,true);
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

test('required startup entry boots with or without a Passenger global', async () => {
  const { readFileSync } = require('node:fs');
  const { runInNewContext } = require('node:vm');
  const source = readFileSync(require.resolve('../server.cjs'), 'utf8');
  for (const passenger of [false, true]) {
    let prepared = 0, listens = 0;const checkpoints=[];
    const server = new EventEmitter();
    server.listen = (port, ready) => { listens++; assert.equal(port, 3000); ready(); };
    const next = () => ({ prepare: async () => { prepared++; }, getRequestHandler: () => () => {} });
    const fakeRequire = name => name === 'node:fs' ? {mkdirSync(){},appendFileSync(_path,record){checkpoints.push(JSON.parse(record).phase);}} : name === './lib/namecheap-server.cjs' ? {start: options => start({next,http:()=>server,env:sandbox.process.env,checkpoint:options.checkpoint})} : require(name);
    fakeRequire.main = {}; // The hosting loader is the main module.
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
    assert.equal(prepared, 1);
    assert.equal(listens, 1);
    assert.deepEqual(checkpoints, ['entry-loaded','validate-origin','origin-valid','listen-start','listening','next-create','next-prepare','next-ready']);
  }
});

test('managed listener binds before Next initialization and requests await readiness', async () => {
  let releasePreparation, handler, prepared = false;
  const calls = [], server = new EventEmitter();
  server.listen = (_port, done) => { calls.push('hosting-listen'); done(); };
  const initializing = start({
    env: { APP_URL: 'https://quizmint.test' },
    http: value => { handler = value; return server; },
    next: () => {
      calls.push('load-next');
      assert.deepEqual(calls, ['hosting-listen', 'load-next']);
      return {
        prepare: () => new Promise(resolve => { releasePreparation = () => { prepared = true; resolve(); }; }),
        getRequestHandler: () => (req, res) => { assert.equal(prepared,true);assert.equal(req.headers['oai-authenticated-user-id'],undefined);res.end('ready'); },
      };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  const req={headers:{'oai-authenticated-user-id':'forged'},socket:{remoteAddress:'127.0.0.1'}};
  let body;const res={headersSent:false,destroyed:false,end(value){body=value;}};
  handler(req,res);
  await new Promise(resolve => setImmediate(resolve));assert.equal(body,undefined);
  releasePreparation();await initializing;
  await new Promise(resolve => setImmediate(resolve));assert.equal(body,'ready');
});
