import { randomUUID } from 'node:crypto';
import { filesystemImageBucket } from '../lib/images/filesystem.mjs';
import { namecheapDatabase, closeNamecheapDatabase } from '../db/namecheap.mjs';
import { imageRepository } from '../db/namecheap-images.mjs';
import { exerciseImageReferences } from '../tests/helpers/namecheap-image-checks.mjs';
import assert from 'node:assert/strict';
let connection, bucket, key, created = false, phase = 'private storage';
try {
  bucket = filesystemImageBucket(); await bucket.check();
  key = 'question-images/' + randomUUID().replaceAll('-', '');
  const bytes = new Uint8Array([137,80,78,71,13,10,26,10,0]);
  await bucket.put(key, bytes, { httpMetadata: { contentType: 'image/png' }, customMetadata: { owner: 'storage-check', created: String(Date.now()) } });
  created = true;
  assert.equal((await bucket.head(key)).customMetadata.owner, 'storage-check');
  assert.deepEqual(new Uint8Array((await bucket.get(key)).body), bytes);
  await bucket.delete(key); assert.equal(await bucket.get(key), null); key = undefined;
  phase = 'temporary tables';
  connection = await (await namecheapDatabase()).getConnection();
  const sources = ['quizzes', 'arena_rooms'], suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const names = Object.fromEntries(sources.map(name => [name, `qm_check_${suffix}_${name}`]));
  for (const source of sources) await connection.query(`CREATE TEMPORARY TABLE \`${names[source]}\` LIKE \`${source}\``);
  const execute = (sql, values) => connection.execute(sql.replace(/\b(quizzes|arena_rooms)\b/g, name => names[name]), values);
  phase = 'image reference queries';
  await exerciseImageReferences({ store: imageRepository({ execute }), execute });
  console.log('Namecheap image checks passed: private storage, upload/read/delete and MariaDB quiz/Arena reference protection. Probe file removed. Permanent images, quizzes and rooms unchanged.');
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : null;
  console.error(`Image checks failed during ${phase}${code ? ` (${code})` : ''}. Check private storage path/permissions and database settings.`); process.exitCode = 1;
} finally {
  if (key && created) { try { await bucket.delete(key); } catch { console.error('Unable to clean up image probe. Check private storage permissions.'); process.exitCode = 1; } }
  if (connection) connection.destroy();
  await closeNamecheapDatabase();
}
