// Importable server implementation. Only server.cjs starts it automatically.
const { createServer } = require('node:http');
const path = require('node:path');
const { sanitizeRequest } = require('./namecheap-request.cjs');
const appRoot = path.resolve(__dirname, '..');

async function start({ next = require('next'), env = process.env, http = createServer, checkpoint = () => {} } = {}) {
  const dev = env.NODE_ENV === 'development';
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  checkpoint('next-create');
  const app = next({ dev, dir: appRoot });
  checkpoint('next-prepare');
  await app.prepare();
  checkpoint('next-ready');
  const handle = app.getRequestHandler();
  const server = http((req, res) => {
    sanitizeRequest(req, env);
    Promise.resolve().then(() => handle(req, res)).catch(() => {
      // Never log request URLs: password-recovery URLs may contain private data.
      console.error('QuizMint request failed.');
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('Unable to process this request.');
      } else {
        res.destroy();
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    // Passenger intercepts listen() to bind its own socket on cPanel.
    checkpoint('listen-start');
    server.listen(port, resolve);
  });
  checkpoint('listening');
  console.log('QuizMint Node.js server started.');
  return { server, app };
}

module.exports = { start };
