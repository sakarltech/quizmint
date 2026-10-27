// cPanel/Passenger entry point for the Namecheap deployment.
// This requires a standard Next.js build, not the existing Cloudflare artifact.
const { createServer } = require('node:http');
const path = require('node:path');
const { sanitizeRequest } = require('./lib/namecheap-request.cjs');

async function start({ next = require('next'), env = process.env, http = createServer } = {}) {
  const dev = env.NODE_ENV === 'development';
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const app = next({ dev, dir: __dirname });
  await app.prepare();
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
    server.listen(port, resolve);
  });
  console.log('QuizMint Node.js server started.');
  return { server, app };
}

// Passenger requires its startup file from node-loader.js, so require.main is
// the loader rather than this module. Ordinary imports by tests stay inert.
if (require.main === module || global.PhusionPassenger) {
  process.env.NODE_ENV ||= 'production';
  // Resolve local modules relative to the app, regardless of Passenger's cwd.
  process.chdir(path.resolve(__dirname));
  Promise.resolve().then(() => {
    const origin = new URL(process.env.APP_URL || '');
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Configure the public HTTPS APP_URL.');
    return start();
  }).catch(() => {
    console.error('QuizMint startup failed. Check dependencies, build and server configuration.');
    process.exitCode = 1;
  });
}

module.exports = { start };
