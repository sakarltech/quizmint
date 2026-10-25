// Native MariaDB account operations. Runtime wiring follows after the remaining
// D1 callers are migrated; do not feed SQLite SQL into this repository.
import { transaction } from './namecheap.mjs';

export function accountRepository(pool) {
  return {
    async findByEmail(email) {
      const [rows] = await pool.execute('SELECT id,email,password_hash,salt,created FROM creator_users WHERE email=?', [email]);
      return rows[0] ?? null;
    },
    async createUser({ id, email, passwordHash, salt, created }) {
      try {
        await pool.execute('INSERT INTO creator_users(id,email,password_hash,salt,created) VALUES(?,?,?,?,?)', [id, email, passwordHash, salt, created]);
        return true;
      } catch (error) {
        // Concurrent registrations are resolved by the unique key, not a prior read.
        if (error?.code === 'ER_DUP_ENTRY') return false;
        throw error;
      }
    },
    async findSession(tokenHash, now = Date.now()) {
      const [rows] = await pool.execute('SELECT u.id,u.email FROM creator_sessions s JOIN creator_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?', [tokenHash, now]);
      return rows[0] ?? null;
    },
    async issueSession({ tokenHash, userId, passwordHash, salt, now = Date.now() }) {
      return transaction(pool, async connection => {
        // Serialize against a concurrent password change before issuing the cookie.
        const [users] = await connection.execute('SELECT id FROM creator_users WHERE id=? AND password_hash=? AND salt=? FOR UPDATE', [userId, passwordHash, salt]);
        if (!users.length) return false;
        await connection.execute('INSERT INTO creator_sessions(token_hash,user_id,expires) VALUES(?,?,?)', [tokenHash, userId, now + 604800000]);
        return true;
      });
    },
    async revokeSession(tokenHash) {
      await pool.execute('DELETE FROM creator_sessions WHERE token_hash=?', [tokenHash]);
    },
    async removeExpiredSessions(now = Date.now()) {
      await pool.execute('DELETE FROM creator_sessions WHERE expires<=?', [now]);
    },
    async admit({ keyHash, limit, now = Date.now(), windowMs = 900000 }) {
      if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1 || !Number.isSafeInteger(now) || now < 0) {
        throw new Error('Invalid rate limit settings.');
      }
      const window = Math.floor(now / windowMs);
      return transaction(pool, async connection => {
        // The no-op duplicate update acquires the same row lock for existing keys.
        // All competing requests read/increment the counter under this lock.
        await connection.execute('INSERT INTO auth_limits(`key`,`window`,`count`) VALUES(?,?,0) ON DUPLICATE KEY UPDATE `key`=VALUES(`key`)', [keyHash, window]);
        const [rows] = await connection.execute('SELECT `window`,`count` FROM auth_limits WHERE `key`=? FOR UPDATE', [keyHash]);
        if (!rows[0]) throw new Error('Rate limit row unavailable.');
        const count = Number(rows[0].window) === window ? Number(rows[0].count) : 0;
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid rate limit counter.');
        if (count >= limit) return false;
        await connection.execute('UPDATE auth_limits SET `window`=?,`count`=? WHERE `key`=?', [window, count + 1, keyHash]);
        return true;
      });
    },
  };
}
