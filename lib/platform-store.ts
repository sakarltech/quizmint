import { env } from 'cloudflare:workers';
import type { platformRepository } from '../db/namecheap-platform.mjs';
type PlatformStore = ReturnType<typeof platformRepository>;
let nativeStore: Promise<PlatformStore> | undefined;
// The legacy D1 path remains available until the standalone Node cutover.
export async function nativePlatformStore(): Promise<PlatformStore | null> {
  if ((env as any).QUIZMINT_RUNTIME !== 'namecheap') return null;
  if (!nativeStore) nativeStore = Promise.all([import('../db/namecheap.mjs'), import('../db/namecheap-platform.mjs')])
    .then(async ([database, platform]) => platform.platformRepository(await database.namecheapDatabase()))
    .catch(error => { nativeStore = undefined; throw error; });
  return nativeStore;
}
