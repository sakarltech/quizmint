// Importable server implementation. Only server.cjs starts it automatically.
const { createServer } = require('node:http');
const path = require('node:path');
const { sanitizeRequest } = require('./namecheap-request.cjs');
const appRoot = path.resolve(__dirname, '..');

async function start({ next, env = process.env, http = createServer, checkpoint = () => {} } = {}) {
  const dev = env.NODE_ENV === 'development';
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  let handle, app, resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // Preparation can fail before any request arrives. Startup handles that failure.
  ready.catch(() => {});
  let observedRequest = false;
  const server = http((req, res) => {
    if (!observedRequest) { observedRequest = true; checkpoint('first-request'); }
    ready.then(() => {
      if (res.destroyed) return;
      sanitizeRequest(req, env);
      return handle(req, res);
    }).catch(error => {
      checkpoint('request-failed', error);
      // Never log request URLs: password-recovery URLs may contain private data.
      console.error('QuizMint request failed.');
      if (!res.headersSent && !res.destroyed) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('Unable to process this request.');
      } else {
        res.destroy();
      }
    });
  });
  try {
    // Claim the hosting supervisor's first HTTP listener synchronously, before
    // loading Next or yielding to asynchronous framework preparation. LiteSpeed
    // binds its managed Unix socket here; the requested TCP port is ignored.
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      checkpoint('listen-start');
      server.listen(port, resolve);
    });
    checkpoint('listening');
    if (typeof server.address === 'function') {
      const address = server.address();
      checkpoint(typeof address === 'string' ? 'listener-unix' : address ? 'listener-tcp' : 'listener-unknown');
    }
    checkpoint('next-create');
    app = (next || require('next'))({ dev, dir: appRoot });
    checkpoint('next-prepare');
    await app.prepare();
    handle = app.getRequestHandler();
    checkpoint('next-ready');
    resolveReady();
    console.log('QuizMint Node.js server started.');
    return { server, app };
  } catch (error) {
    rejectReady(error);
    // Do not leave a listener that accepts requests but can never become ready.
    server.closeAllConnections?.();
    await new Promise(resolve => { try { server.close(() => resolve()); } catch { resolve(); } });
    if (app?.close) { try { await app.close(); } catch { /* Preserve startup error. */ } }
    throw error;
  }
}

module.exports = { start };
