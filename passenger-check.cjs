// Temporary staging diagnostic. Restore server.cjs after checking Passenger.
// Does not load application settings, database drivers, Next.js or provider SDKs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, '.sites-runtime');
function record(phase) {
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.appendFileSync(path.join(directory, 'passenger-check.log'), JSON.stringify({ phase, node: process.version, passenger: Boolean(global.PhusionPassenger), time: new Date().toISOString() }) + '\n', { mode: 0o600 });
  } catch { console.error('Unable to write startup check log.'); }
}
record('entry-loaded');
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end('QuizMint staging startup check: OK\n');
});
server.once('error', () => { record('listen-failed'); process.exitCode = 1; });
// Passenger intercepts this call and binds its managed socket.
server.listen(3000, () => { record('listening'); });
