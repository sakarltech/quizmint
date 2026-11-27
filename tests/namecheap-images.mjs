import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir, stat, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filesystemImageBucket } from '../lib/images/filesystem.mjs';

const png = new Uint8Array([137,80,78,71,13,10,26,10,0,1,2]);
const options = { httpMetadata: { contentType: 'image/png' }, customMetadata: { owner: 'creator', created: String(Date.now()) } };
const key = 'question-images/' + 'a'.repeat(32);
async function fixture(action) {
  const base = await mkdtemp(join(tmpdir(), 'quizmint-images-'));
  const directory = join(base, 'private'); await mkdir(directory, { mode: 0o700 });
  try { await action({ directory, bucket: filesystemImageBucket(directory), base }); } finally { await rm(base, { recursive: true, force: true }); }
}
test('private image storage preserves bytes/metadata, private modes and atomic collision handling', async () => fixture(async ({ bucket, directory }) => {
  await bucket.put(key, png, options);
  assert.equal((await bucket.head(key)).customMetadata.owner, 'creator');
  assert.equal((await bucket.get(key)).httpMetadata.contentType, 'image/png');
  assert.deepEqual(new Uint8Array((await bucket.get(key)).body), png);
  const files = await readdir(directory); assert.deepEqual(files, ['a'.repeat(32) + '.qmi']);
  assert.equal((await stat(join(directory, files[0]))).mode & 0o777, 0o600);
  await assert.rejects(bucket.put(key, new Uint8Array([1]), options), { code: 'EEXIST' });
  assert.deepEqual(new Uint8Array((await bucket.get(key)).body), png);
  assert.equal((await readdir(directory)).length, 1, 'Collision cleanup leaves no staging files');
  await bucket.delete(key); assert.equal(await bucket.get(key), null); await bucket.delete(key);
}));
test('storage rejects traversal, invalid size/types, app/public paths and public directory modes', async () => fixture(async ({ bucket, directory, base }) => {
  for (const invalid of ['../secret', 'question-images/../secret', '/etc/passwd', 'question-images/' + 'A'.repeat(32)]) await assert.rejects(bucket.get(invalid), /identifier/);
  await assert.rejects(bucket.put(key, new Uint8Array(600 * 1024 + 1), options), /upload/);
  await assert.rejects(bucket.put(key, png, { ...options, httpMetadata: { contentType: 'image/svg+xml' } }), /upload/);
  await assert.rejects(filesystemImageBucket('relative/path').check(), /absolute/);
  await assert.rejects(filesystemImageBucket(directory, base).check(), /outside/);
  const web = join(base, 'public_html'); await mkdir(web, { mode: 0o700 });
  await assert.rejects(filesystemImageBucket(web).check(), /outside/);
  await chmod(directory, 0o755); await assert.rejects(filesystemImageBucket(directory).check(), /700/);
}));
test('symlinks and damaged records cannot expose another local file', async () => fixture(async ({ bucket, directory, base }) => {
  const outside = join(base, 'outside'); await writeFile(outside, 'private outside content', { mode: 0o600 });
  const target = join(directory, 'a'.repeat(32) + '.qmi'); await symlink(outside, target);
  assert.equal(await bucket.get(key), null);
  await bucket.delete(key); assert.equal(await readFile(outside, 'utf8'), 'private outside content');
  await writeFile(target, 'invalid-record', { mode: 0o600 }); await assert.rejects(bucket.get(key), /metadata/);
  const alias = join(base, 'alias'); await symlink(directory, alias);
  await assert.rejects(filesystemImageBucket(alias).check(), /private directory/);
}));
