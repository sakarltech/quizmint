import { env } from 'cloudflare:workers';
import type { arenaRepository } from '../db/namecheap-arena.mjs';
let nativeStore: Promise<ReturnType<typeof arenaRepository>> | undefined;
export async function nativeArenaStore() {
  if ((env as any).QUIZMINT_RUNTIME !== 'namecheap') return null;
  if (!nativeStore) nativeStore = Promise.all([import('../db/namecheap.mjs'), import('../db/namecheap-arena.mjs')])
    .then(async ([database, arena]) => arena.arenaRepository(await database.namecheapDatabase()))
    .catch(error => { nativeStore = undefined; throw error; });
  return nativeStore;
}
