// cPanel entry point: always boot when loaded by the hosting supervisor.
// This requires a standard Next.js build, not the existing Cloudflare artifact.
const path = require('node:path');
const fs = require('node:fs');
function startupCheckpoint(phase, error) {
  try {
    const directory = path.join(__dirname, '.sites-runtime');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : undefined;
    const frames = error?.stack?.split('\n').filter(line => /^\s+at /.test(line)).slice(0, 6);
    // Do not include error.message, environment values or request URLs.
    fs.appendFileSync(path.join(directory, 'server-startup.log'), JSON.stringify({ phase, node: process.version, passenger: Boolean(global.PhusionPassenger), code, frames }) + '\n', { mode: 0o600 });
  } catch { console.error('Unable to write QuizMint startup checkpoint.'); }
}
const { start } = require('./lib/namecheap-server.cjs');

// No main-module or supervisor-global detection: the configured entry always boots.
startupCheckpoint('entry-loaded');
process.env.NODE_ENV ||= 'production';
// Resolve local modules relative to the app, regardless of Passenger's cwd.
process.chdir(path.resolve(__dirname));
Promise.resolve().then(() => {
  startupCheckpoint('validate-origin');
  const origin = new URL(process.env.APP_URL || '');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Configure the public HTTPS APP_URL.');
  startupCheckpoint('origin-valid');
  return start({ checkpoint: startupCheckpoint });
}).catch(error => {
  startupCheckpoint('startup-failed', error);
  console.error('QuizMint startup failed. Check dependencies, build and server configuration.');
  process.exitCode = 1;
});
