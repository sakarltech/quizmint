import { env } from 'cloudflare:workers';
import type { filesystemImageBucket } from './images/filesystem.mjs';
import type { imageRepository } from '../db/namecheap-images.mjs';
let bucket: ReturnType<typeof filesystemImageBucket> | undefined;
let repository: Promise<ReturnType<typeof imageRepository>> | undefined;
export async function nativeImageBucket() {
  if ((env as any).QUIZMINT_RUNTIME !== 'namecheap') return null;
  if (!bucket) {
    const { filesystemImageBucket } = await import('./images/filesystem.mjs');
    bucket = filesystemImageBucket();
  }
  return bucket;
}
export async function nativeImageStore() {
  if ((env as any).QUIZMINT_RUNTIME !== 'namecheap') return null;
  if (!repository) repository = Promise.all([import('../db/namecheap.mjs'), import('../db/namecheap-images.mjs')])
    .then(async ([database, images]) => images.imageRepository(await database.namecheapDatabase()))
    .catch(error => { repository = undefined; throw error; });
  return repository;
}
