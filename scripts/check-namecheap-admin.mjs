import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { namecheapDatabase, closeNamecheapDatabase } from '../db/namecheap.mjs';
import { inspectAdministrator } from '../db/namecheap-admin.mjs';
async function hiddenPassword() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error('Password checking requires an interactive terminal.');
  // Readline handles editing/raw mode; discard its echo and write the prompt separately.
  const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const reader = createInterface({ input: process.stdin, output: silent, terminal: true });
  const controller = new AbortController();
  reader.on('SIGINT', () => controller.abort());
  process.stdout.write('Admin password (hidden): ');
  try { return await reader.question('', { signal: controller.signal }); }
  finally { reader.close(); process.stdout.write('\n'); }
}
try {
  if (process.argv.slice(2).some(value => value !== '--password')) throw Error('Unknown option.');
  const password = process.argv.includes('--password') ? await hiddenPassword() : undefined;
  const result = await inspectAdministrator(await namecheapDatabase(), { id: process.env.QUIZMINT_ADMIN_USER_ID, email: process.env.QUIZMINT_ADMIN_EMAIL, password });
  console.log('Administrator account exists: ' + (result.accountExists ? 'YES' : 'NO'));
  if (result.accountExists) {
    console.log('Private configured email matches account: ' + (result.emailMatches === null ? 'NOT CONFIGURED' : result.emailMatches ? 'YES' : 'NO'));
    console.log('Entered password matches account: ' + (result.passwordMatches === null ? 'NOT CHECKED' : result.passwordMatches ? 'YES' : 'NO'));
  }
  console.log('Read-only check. No passwords, sessions or account settings changed.');
} catch (error) {
  const known = ['Unknown option.', 'Password checking requires an interactive terminal.', 'Set QUIZMINT_ADMIN_USER_ID privately.'];
  console.error(known.includes(error.message) ? error.message : error.name === 'AbortError' ? 'Password check cancelled.' : 'Administrator check failed. Check private database settings.');
  process.exitCode = 1;
} finally { await closeNamecheapDatabase(); }
