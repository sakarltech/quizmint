import { transaction } from './namecheap.mjs';

export async function migrateAdminUsers(pool) {
  const [columns] = await pool.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='creator_users'");
  if (!columns.some(row => row.COLUMN_NAME === 'suspended_at')) await pool.query('ALTER TABLE creator_users ADD COLUMN suspended_at BIGINT NULL, ADD COLUMN suspension_reason VARCHAR(500) NULL');
  await pool.query('CREATE TABLE IF NOT EXISTS admin_audit_log (id VARCHAR(191) PRIMARY KEY,admin_id VARCHAR(191) NOT NULL,target_user_id VARCHAR(191) NULL,action VARCHAR(64) NOT NULL,detail VARCHAR(500) NULL,created BIGINT NOT NULL,KEY admin_audit_target_created (target_user_id,created)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
}

export function adminUserRepository(pool) {
  return {
    async list(query = '') {
      const term = '%' + query.trim().toLowerCase() + '%';
      const [rows] = await pool.execute(`SELECT u.id,u.email,u.created,u.suspended_at,u.suspension_reason,p.profile,w.free_remaining,w.credits,w.subscription_end,(SELECT COUNT(*) FROM quizzes q WHERE q.owner_id=u.id) quizzes,(SELECT COUNT(*) FROM attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE q.owner_id=u.id) submissions FROM creator_users u LEFT JOIN creator_profiles p ON p.user_id=u.id LEFT JOIN ai_wallets w ON w.user_id=u.id WHERE u.email LIKE ? ORDER BY u.created DESC LIMIT 100`, [term]);
      return rows.map(row => ({...row,profile:row.profile?JSON.parse(row.profile):null,free_remaining:Number(row.free_remaining ?? 20),credits:Number(row.credits ?? 0),subscription_end:Number(row.subscription_end ?? 0),quizzes:Number(row.quizzes),submissions:Number(row.submissions)}));
    },
    async update({adminId,userId,action,credits,reason}) {
      return transaction(pool, async connection => {
        const [users] = await connection.execute('SELECT id FROM creator_users WHERE id=? FOR UPDATE',[userId]);
        if (!users.length || userId === adminId) throw Error('User not available.');
        if (action === 'suspend') { await connection.execute('UPDATE creator_users SET suspended_at=?,suspension_reason=? WHERE id=?',[Date.now(),reason||null,userId]); await connection.execute('DELETE FROM creator_sessions WHERE user_id=?',[userId]); }
        else if (action === 'reactivate') await connection.execute('UPDATE creator_users SET suspended_at=NULL,suspension_reason=NULL WHERE id=?',[userId]);
        else if (action === 'credits') { if (!Number.isSafeInteger(credits) || credits < -100000 || credits > 100000) throw Error('Invalid credit adjustment.'); await connection.execute('INSERT INTO ai_wallets(user_id,free_period_start) VALUES(?,0) ON DUPLICATE KEY UPDATE user_id=user_id',[userId]); await connection.execute('UPDATE ai_wallets SET credits=GREATEST(0,credits+?) WHERE user_id=?',[credits,userId]); }
        else throw Error('Invalid action.');
        await connection.execute('INSERT INTO admin_audit_log(id,admin_id,target_user_id,action,detail,created) VALUES(?,?,?,?,?,?)',[crypto.randomUUID(),adminId,userId,action,action==='credits'?String(credits):reason||null,Date.now()]);
      });
    },
  };
}
