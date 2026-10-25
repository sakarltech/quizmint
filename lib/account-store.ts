import { env } from 'cloudflare:workers';
import { db } from './server';

export type StoredUser = { id: string; email: string; password_hash: string; salt: string; created?: string };
type Identity = { id: string; email: string };
type NewUser = { id: string; email: string; passwordHash: string; salt: string; created: string };
type NewSession = { tokenHash: string; userId: string; passwordHash: string; salt: string; now?: number };
export interface AccountStore {
  findByEmail(email: string): Promise<StoredUser | null>;
  createUser(user: NewUser): Promise<boolean>;
  findSession(tokenHash: string, now?: number): Promise<Identity | null>;
  issueSession(session: NewSession): Promise<boolean>;
  revokeSession(tokenHash: string): Promise<void>;
  removeExpiredSessions(now?: number): Promise<void>;
  admit(input: { keyHash: string; limit: number; now?: number; windowMs?: number }): Promise<boolean>;
}

// Keep the current deployed D1 behavior while the Node runtime is being migrated.
const workerStore: AccountStore = {
  findByEmail(email) {
    return db().prepare('SELECT * FROM creator_users WHERE email=?').bind(email).first<StoredUser>();
  },
  async createUser(user) {
    try {
      await db().prepare('INSERT INTO creator_users(id,email,password_hash,salt,created) VALUES(?,?,?,?,?)').bind(user.id, user.email, user.passwordHash, user.salt, user.created).run();
      return true;
    } catch (error) {
      // D1 exposes SQLite constraint failures through message/cause; don't hide
      // connectivity errors behind the duplicate-registration response.
      if (/UNIQUE constraint failed: creator_users\.(email|id)/.test(String(error))) return false;
      throw error;
    }
  },
  findSession(tokenHash, now = Date.now()) {
    return db().prepare('SELECT u.id,u.email FROM creator_sessions s JOIN creator_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?').bind(tokenHash, now).first<Identity>();
  },
  async issueSession({ tokenHash, userId, passwordHash, salt, now = Date.now() }) {
    await db().batch([
      db().prepare('DELETE FROM creator_sessions WHERE expires<=?').bind(now),
      db().prepare('INSERT INTO creator_sessions(token_hash,user_id,expires) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM creator_users WHERE id=? AND password_hash=? AND salt=?)').bind(tokenHash, userId, now + 604800000, userId, passwordHash, salt),
    ]);
    return Boolean(await db().prepare('SELECT token_hash FROM creator_sessions WHERE token_hash=?').bind(tokenHash).first());
  },
  async revokeSession(tokenHash) { await db().prepare('DELETE FROM creator_sessions WHERE token_hash=?').bind(tokenHash).run(); },
  async removeExpiredSessions(now = Date.now()) { await db().prepare('DELETE FROM creator_sessions WHERE expires<=?').bind(now).run(); },
  async admit({ keyHash, limit, now = Date.now(), windowMs = 900000 }) {
    const window = Math.floor(now / windowMs);
    await db().prepare('INSERT INTO auth_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window').bind(keyHash, window).run();
    const row = await db().prepare('SELECT count FROM auth_limits WHERE key=?').bind(keyHash).first<{ count: number }>();
    return Boolean(row && row.count <= limit);
  },
};

let mariaStore: Promise<AccountStore> | undefined;
export function accountStore(): Promise<AccountStore> {
  if ((env as any).QUIZMINT_RUNTIME !== 'namecheap') return Promise.resolve(workerStore);
  if (!mariaStore) {
    mariaStore = Promise.all([import('../db/namecheap.mjs'), import('../db/namecheap-accounts.mjs')])
      .then(async ([database, accounts]) => accounts.accountRepository(await database.namecheapDatabase()) as AccountStore)
      .catch(error => { mariaStore = undefined; throw error; });
  }
  return mariaStore;
}
