import { constants } from 'node:fs';
import { open, realpath, lstat, link, unlink } from 'node:fs/promises';
import { isAbsolute, resolve, relative, sep, join } from 'node:path';
import { randomUUID } from 'node:crypto';
const MAX_BYTES = 600 * 1024, HEADER_BYTES = 1024;
const types = new Set(['image/png', 'image/jpeg', 'image/webp']);
const inside = (parent, child) => { const path = relative(parent, child); return path === '' || (!path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path)); };

export function filesystemImageBucket(directory = process.env.QUIZMINT_IMAGE_DIR, appDirectory = process.cwd()) {
  let ready;
  async function root() {
    if (!ready) ready = (async () => {
      if (typeof directory !== 'string' || !isAbsolute(directory) || directory === sep) throw Error('Configure an absolute private QUIZMINT_IMAGE_DIR.');
      const requested = resolve(directory), stat = await lstat(requested);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Image storage must be a private directory.');
      const [path, app] = await Promise.all([realpath(requested), realpath(appDirectory)]);
      if (inside(app, path) || path.split(sep).some(part => ['public_html', 'www', 'public', 'htdocs'].includes(part.toLowerCase()))) throw Error('Image storage must be outside the application and web document roots.');
      if ((stat.mode & 0o077) !== 0) throw Error('Set image directory permissions to 700.');
      return path;
    })().catch(error => { ready = undefined; throw error; });
    return ready;
  }
  async function filename(key) {
    if (typeof key !== 'string' || !/^question-images\/[a-f0-9]{32}$/.test(key)) throw Error('Invalid image identifier.');
    return join(await root(), key.slice('question-images/'.length) + '.qmi');
  }
  async function read(key, includeBody) {
    let file;
    try {
      file = await open(await filename(key), constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_BYTES + HEADER_BYTES || (stat.mode & 0o077) !== 0) throw Error('Invalid private image file.');
      const header = Buffer.alloc(Math.min(stat.size, HEADER_BYTES));
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      const newline = header.subarray(0, bytesRead).indexOf(10);
      if (newline < 0) throw Error('Invalid image metadata.');
      const metadata = JSON.parse(header.subarray(0, newline).toString('utf8'));
      if (metadata.version !== 1 || typeof metadata.owner !== 'string' || !metadata.owner || typeof metadata.created !== 'string' || !types.has(metadata.contentType) || !Number.isInteger(metadata.size) || metadata.size < 1 || metadata.size > MAX_BYTES || stat.size !== newline + 1 + metadata.size) throw Error('Invalid image metadata.');
      const asset = { customMetadata: { owner: metadata.owner, created: metadata.created }, httpMetadata: { contentType: metadata.contentType } };
      if (!includeBody) return asset;
      const body = new Uint8Array(metadata.size);
      let offset = 0;
      while (offset < body.length) {
        const chunk = await file.read(body, offset, body.length - offset, newline + 1 + offset);
        if (!chunk.bytesRead) throw Error('Incomplete image file.');
        offset += chunk.bytesRead;
      }
      return { ...asset, body: body.buffer };
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ELOOP') return null;
      throw error;
    } finally { if (file) await file.close(); }
  }
  return {
    async put(key, bytes, options) {
      const destination = await filename(key);
      if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > MAX_BYTES || !types.has(options?.httpMetadata?.contentType) || typeof options?.customMetadata?.owner !== 'string' || !options.customMetadata.owner || options.customMetadata.owner.length > 256 || !/^\d{1,16}$/.test(options.customMetadata.created || '')) throw Error('Invalid image upload.');
      const metadata = Buffer.from(JSON.stringify({ version: 1, owner: options.customMetadata.owner, created: options.customMetadata.created, contentType: options.httpMetadata.contentType, size: bytes.length }) + '\n');
      if (metadata.length > HEADER_BYTES) throw Error('Invalid image metadata.');
      const temporary = destination + '.' + randomUUID() + '.tmp';
      let file;
      try {
        file = await open(temporary, 'wx', 0o600);
        await file.writeFile(Buffer.concat([metadata, bytes]));
        await file.sync();
        await file.close(); file = undefined;
        // Publish the complete file atomically, without replacing an existing id.
        await link(temporary, destination);
      } finally {
        if (file) await file.close();
        await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    },
    head: key => read(key, false),
    async get(key) { const asset = await read(key, true); return asset && 'body' in asset ? asset : null; },
    async delete(key) {
      // unlink removes a symlink itself; it never follows its target.
      try { await unlink(await filename(key)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    },
    async check() { await root(); },
  };
}
