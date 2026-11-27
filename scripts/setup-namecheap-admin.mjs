import { namecheapDatabase, closeNamecheapDatabase } from '../db/namecheap.mjs';
import { provisionAdministrator } from '../db/namecheap-admin.mjs';
try {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some(value => value !== '--apply')) throw Error('Unknown option.');
  const id = await provisionAdministrator(await namecheapDatabase(), { email: process.env.QUIZMINT_ADMIN_EMAIL, password: process.env.QUIZMINT_ADMIN_PASSWORD, apply: arguments_.includes('--apply') });
  if (id) console.log(`Administrator account created. Set QUIZMINT_ADMIN_USER_ID=${id} in private .env.namecheap and cPanel, then remove QUIZMINT_ADMIN_PASSWORD. Sign in through /login. No session was created.`);
  else console.log('Administrator setup ready. No data changed. Run again with --apply to create the account.');
} catch (error) {
  const known = ['Set QUIZMINT_ADMIN_EMAIL privately.', 'Invalid administrator email.', 'Set a private administrator password of 12–128 characters.', 'Account already exists. No account was promoted or changed.', 'Unknown option.'];
  console.error(known.includes(error.message) ? error.message : 'Administrator setup failed. Check private settings and database access. No existing account was promoted.');
  process.exitCode = 1;
} finally { await closeNamecheapDatabase(); }
