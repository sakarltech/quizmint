import { env } from 'cloudflare:workers';
import { db } from './server';
interface PasswordResetStore {
  issue(email: string, tokenHash: string, now?: number): Promise<boolean>;
  invalidate(tokenHash: string): Promise<void>;
  find(tokenHash: string, now?: number): Promise<{id: string; email: string; password_hash: string} | null>;
  consume(input: {userId: string; tokenHash: string; previousHash: string; newHash: string; salt: string; now?: number}): Promise<boolean>;
}
const workerStore: PasswordResetStore = {
  async issue(email, tokenHash, now = Date.now()) {
    await db().prepare('DELETE FROM creator_password_resets WHERE expires<=?').bind(now).run();
    await db().prepare('INSERT INTO creator_password_resets(user_id,token_hash,password_hash,expires,used,created) SELECT id,?,password_hash,?,0,? FROM creator_users WHERE email=? ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,password_hash=excluded.password_hash,expires=excluded.expires,used=0,created=excluded.created').bind(tokenHash, now + 1800000, now, email).run();
    return Boolean(await db().prepare('SELECT user_id FROM creator_password_resets WHERE token_hash=?').bind(tokenHash).first());
  },
  async invalidate(tokenHash) { await db().prepare('UPDATE creator_password_resets SET used=? WHERE token_hash=?').bind(Date.now(), tokenHash).run(); },
  find(tokenHash, now = Date.now()) { return db().prepare('SELECT u.id,u.email,u.password_hash FROM creator_password_resets r JOIN creator_users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used=0 AND r.expires>? AND r.password_hash=u.password_hash').bind(tokenHash, now).first(); },
  async consume({userId, tokenHash, previousHash, newHash, salt, now = Date.now()}) {
    await db().batch([
      db().prepare('UPDATE creator_users SET password_hash=?,salt=? WHERE id=? AND password_hash=? AND EXISTS(SELECT 1 FROM creator_password_resets WHERE user_id=? AND token_hash=? AND used=0 AND expires>?)').bind(newHash, salt, userId, previousHash, userId, tokenHash, Date.now()),
      db().prepare('UPDATE creator_password_resets SET used=? WHERE user_id=? AND token_hash=? AND used=0 AND EXISTS(SELECT 1 FROM creator_users WHERE id=? AND password_hash=? AND salt=?)').bind(now, userId, tokenHash, userId, newHash, salt),
      db().prepare('DELETE FROM creator_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM creator_password_resets r JOIN creator_users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used=? AND u.password_hash=? AND u.salt=?)').bind(userId, tokenHash, now, newHash, salt),
    ]);
    return Boolean(await db().prepare('SELECT id FROM creator_users WHERE id=? AND password_hash=? AND salt=?').bind(userId, newHash, salt).first());
  },
};
let mariaStore: Promise<PasswordResetStore> | undefined;
export function passwordResetStore(): Promise<PasswordResetStore> {
  if ((env as any).QUIZMINT_RUNTIME !== 'namecheap') return Promise.resolve(workerStore);
  if (!mariaStore) mariaStore = Promise.all([import('../db/namecheap.mjs'), import('../db/namecheap-password-resets.mjs')])
    .then(async ([database, resets]) => resets.passwordResetRepository(await database.namecheapDatabase()) as PasswordResetStore)
    .catch(error => { mariaStore = undefined; throw error; });
  return mariaStore;
}
