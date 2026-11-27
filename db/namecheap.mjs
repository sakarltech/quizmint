// Server-only MariaDB connection foundation. Application queries are migrated separately.
export function databaseOptions(env = process.env) {
  for (const key of ['DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    if (typeof env[key] !== 'string' || env[key].length === 0) {
      throw new Error(`Set ${key} in the private server environment.`);
    }
  }
  const port = Number(env.DB_PORT || 3306);
  const limit = Number(env.DB_CONNECTION_LIMIT || 5);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DB_PORT.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('DB_CONNECTION_LIMIT must be between 1 and 20.');
  return {
    host: env.DB_HOST || 'localhost', port,
    database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
    charset: 'utf8mb4', timezone: 'Z',
    waitForConnections: true, connectionLimit: limit, maxIdle: limit,
    idleTimeout: 60000, queueLimit: 50, connectTimeout: 10000,
    enableKeepAlive: true, multipleStatements: false,
    supportBigNumbers: true, bigNumberStrings: false,
  };
}

let pool;
export async function namecheapDatabase() {
  if (!pool) {
    // Validate before loading the driver; never connect during module import/build.
    const options = databaseOptions();
    const mysql = await import('mysql2/promise');
    pool ??= mysql.createPool(options);
  }
  return pool;
}

// All queries in a transaction must use this connection, not the shared pool.
// Do not automatically retry: an ambiguous commit could duplicate a payment.
export async function transaction(database, action) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const result = await action(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch { /* Preserve the original error. */ }
    throw error;
  } finally {
    connection.release();
  }
}

export async function closeNamecheapDatabase() {
  const active = pool;
  pool = undefined;
  if (active) await active.end();
}
