import { transaction } from './namecheap.mjs';
const clock = 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)';

export function passwordResetRepository(pool) {
  return {
    async issue(email, tokenHash, now = Date.now()) {
      await pool.execute('DELETE FROM creator_password_resets WHERE expires<=?', [now]);
      return transaction(pool, async connection => {
        // Match the user-first lock order used by password changes and login.
        const [users] = await connection.execute('SELECT id,password_hash FROM creator_users WHERE email=? FOR UPDATE', [email]);
        if (!users.length) return false;
        const user = users[0];
        await connection.execute('INSERT INTO creator_password_resets(user_id,token_hash,password_hash,expires,used,created) VALUES(?,?,?,?,0,?) ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),password_hash=VALUES(password_hash),expires=VALUES(expires),used=0,created=VALUES(created)', [user.id, tokenHash, user.password_hash, now + 1800000, now]);
        return true;
      });
    },
    async invalidate(tokenHash) {
      await pool.execute('UPDATE creator_password_resets SET used=? WHERE token_hash=?', [Date.now(), tokenHash]);
    },
    async find(tokenHash) {
      const [rows] = await pool.execute(`SELECT u.id,u.email,u.password_hash FROM creator_password_resets r JOIN creator_users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used=0 AND r.expires>${clock} AND r.password_hash=u.password_hash`, [tokenHash]);
      return rows[0] ?? null;
    },
    async consume({ userId, tokenHash, previousHash, newHash, salt }) {
      return transaction(pool, async connection => {
        const [users] = await connection.execute('SELECT id FROM creator_users WHERE id=? AND password_hash=? FOR UPDATE', [userId, previousHash]);
        if (!users.length) return false;
        await connection.execute('SELECT user_id FROM creator_password_resets WHERE user_id=? FOR UPDATE', [userId]);
        // Evaluate expiry again after acquiring locks, rather than using the time
        // the request arrived. A token may expire while PBKDF2/locking is pending.
        const [tokens] = await connection.execute(`SELECT user_id FROM creator_password_resets WHERE user_id=? AND token_hash=? AND used=0 AND expires>${clock} AND password_hash=?`, [userId, tokenHash, previousHash]);
        if (!tokens.length) return false;
        await connection.execute('UPDATE creator_users SET password_hash=?,salt=? WHERE id=?', [newHash, salt, userId]);
        await connection.execute('UPDATE creator_password_resets SET used=? WHERE user_id=? AND token_hash=?', [Date.now(), userId, tokenHash]);
        await connection.execute('DELETE FROM creator_sessions WHERE user_id=?', [userId]);
        return true;
      });
    },
  };
}
