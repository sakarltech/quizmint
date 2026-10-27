import { randomUUID, pbkdf2 as derive } from 'node:crypto';
import { promisify } from 'node:util';
import { transaction } from './namecheap.mjs';
const pbkdf2 = promisify(derive);
export async function provisionAdministrator(pool, { email, password, apply = false }) {
  if (typeof email !== 'string') throw Error('Set QUIZMINT_ADMIN_EMAIL privately.');
  email = email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Invalid administrator email.');
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw Error('Set a private administrator password of 12–128 characters.');
  const [existing] = await pool.execute('SELECT id FROM creator_users WHERE email=?', [email]);
  if (existing.length) throw Error('Account already exists. No account was promoted or changed.');
  if (!apply) return null;
  const salt = randomUUID(), id = randomUUID();
  const hash = (await pbkdf2(password, salt, 100000, 32, 'sha256')).toString('hex');
  await transaction(pool, async connection => {
    // The unique email key also rejects registrations racing provisioning. There
    // is no update/promote path for an existing public account.
    await connection.execute('INSERT INTO creator_users(id,email,password_hash,salt,created) VALUES(?,?,?,?,?)', [id, email, hash, salt, new Date().toISOString()]);
  });
  return id;
}
