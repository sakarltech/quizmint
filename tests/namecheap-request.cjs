const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeRequest } = require('../lib/namecheap-request.cjs');
test('public requests cannot forge identity, client IP, host or protocol forwarding', () => {
  const req = { headers: { 'oai-authenticated-user-id': 'attacker', 'cf-connecting-ip': '1.2.3.4', 'x-quizmint-client-ip': '2.3.4.5', 'x-forwarded-for': '3.4.5.6', 'x-forwarded-proto': 'http', 'x-forwarded-host': 'evil.test', forwarded: 'for=evil' }, socket: { remoteAddress: '192.0.2.10' } };
  sanitizeRequest(req, { APP_URL: 'https://quizmint.test', QUIZMINT_TRUST_PROXY: 'loopback' });
  assert.equal(req.headers['x-quizmint-client-ip'], '192.0.2.10');
  assert.equal(req.headers['x-forwarded-proto'], 'https');
  for (const key of ['oai-authenticated-user-id','cf-connecting-ip','x-forwarded-for','x-forwarded-host','forwarded']) assert.equal(req.headers[key], undefined);
});
test('local proxy trust is explicit and uses the last appended valid address', () => {
  for (const enabled of [false, true]) {
    const req = { headers: { 'x-forwarded-for': '1.2.3.4, 198.51.100.7' }, socket: { remoteAddress: '127.0.0.1' } };
    sanitizeRequest(req, enabled ? { QUIZMINT_TRUST_PROXY: 'loopback' } : {});
    assert.equal(req.headers['x-quizmint-client-ip'], enabled ? '198.51.100.7' : '127.0.0.1');
  }
});
