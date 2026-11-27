import { namecheapDatabase, closeNamecheapDatabase } from '../db/namecheap.mjs';
import { setupSchema } from '../db/namecheap-schema.mjs';

try {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply') || args.length > 1) throw new Error('Usage: npm run db:setup:namecheap -- [--apply]');
  const result = await setupSchema(await namecheapDatabase(), { apply: args.includes('--apply') });
  if (result.state === 'ready') console.log(`Database is empty. Ready to create ${result.tables} application tables. No schema changes made. Run again with --apply to create them.`);
  if (result.state === 'created') console.log(`Created ${result.tables} application tables and the migration journal. No account or quiz data imported.`);
  if (result.state === 'already-complete') console.log(`Schema already installed: ${result.tables} application tables. No changes made.`);
} catch (error) {
  // Own messages contain no connection details; driver messages can contain credentials.
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : null;
  if (code) console.error(`Schema setup failed (${code}). Stop and inspect the database before retrying. No tables were automatically removed.`);
  else if (/^(Database is not empty|Another schema|An incomplete|Migration checksum|An expected|Schema migration|Usage:|Set DB_|Invalid DB_|DB_CONNECTION_LIMIT)/.test(error?.message || '')) console.error(error.message);
  else console.error('Schema setup failed. Stop and inspect before retrying. No tables were automatically removed.');
  process.exitCode = 1;
} finally {
  await closeNamecheapDatabase();
}
