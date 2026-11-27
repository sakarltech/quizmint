// Read-only connection check. No schema creation, import or application writes.
import { namecheapDatabase, closeNamecheapDatabase } from '../db/namecheap.mjs';

try {
  const database = await namecheapDatabase();
  const [rows] = await database.execute('SELECT 1 AS connection_ok, DATABASE() AS database_name');
  if (rows[0]?.connection_ok !== 1 || rows[0]?.database_name !== process.env.DB_NAME) {
    throw new Error('Unexpected database connection.');
  }
  console.log('Database connection successful. Selected database matches DB_NAME. No data changed.');
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : null;
  if (code) {
    console.error(`Database check failed (${code}). Check private credentials, user privileges and database host.`);
  } else if (/^Set DB_|^Invalid DB_PORT|^DB_CONNECTION_LIMIT/.test(error?.message || '')) {
    console.error(error.message);
  } else {
    console.error('Database check failed. Verify mysql2 is installed and the database settings are correct.');
  }
  process.exitCode = 1;
} finally {
  await closeNamecheapDatabase();
}
