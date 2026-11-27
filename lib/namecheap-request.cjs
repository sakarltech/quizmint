const { isIP } = require('node:net');
function sanitizeRequest(req, env = process.env) {
  const forwarded = req.headers['x-forwarded-for'];
  const peer = req.socket?.remoteAddress || '';
  for (const key of Object.keys(req.headers)) {
    if (key.startsWith('oai-') || key.startsWith('cf-') || key.startsWith('x-quizmint-')) delete req.headers[key];
  }
  let address = isIP(peer) ? peer : 'unknown';
  // Only enable after confirming the local Apache proxy appends/overwrites XFF.
  if (env.QUIZMINT_TRUST_PROXY === 'loopback' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)) {
    const last = typeof forwarded === 'string' ? forwarded.split(',').at(-1).trim() : '';
    if (isIP(last)) address = last;
  }
  req.headers['x-quizmint-client-ip'] = address;
  // Next must not infer origin/scheme from arbitrary forwarded headers.
  delete req.headers.forwarded;
  delete req.headers['x-forwarded-host'];
  delete req.headers['x-forwarded-for'];
  const origin = env.APP_URL ? new URL(env.APP_URL) : null;
  req.headers['x-forwarded-proto'] = origin?.protocol === 'https:' ? 'https' : 'http';
}
module.exports = { sanitizeRequest };
