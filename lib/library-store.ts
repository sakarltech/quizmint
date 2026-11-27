import { env } from 'cloudflare:workers';
import { db } from './server';
import type { validateQuiz } from './quiz';
type Quiz = ReturnType<typeof validateQuiz>;
interface LibraryStore {
  get(id: string): Promise<{ id: string; quiz: string; copies: number } | null>;
  list(words: string[], offset: number): Promise<any[]>;
  copy(input: { sourceId: string; sourceSnapshot: string; id: string; ownerId: string | null; quiz: Quiz; created: string }): Promise<boolean>;
  unpublish(id: string): Promise<void>;
  publish(input: { id: string; ownerId: string; quiz: Quiz; created: number }): Promise<void>;
  profile(userId: string): Promise<{ profile: string; updated: string } | null>;
  saveProfile(userId: string, profile: unknown, updated: string): Promise<void>;
}
const workerStore: LibraryStore = {
  get(id) { return db().prepare('SELECT id,quiz,copies FROM public_quizzes WHERE id=? AND published=1').bind(id).first(); },
  async list(words, offset) {
    const search = words.map(word => '"' + word + '"*').join(' AND ');
    const filter = words.length ? ' AND rowid IN (SELECT rowid FROM public_quiz_search WHERE public_quiz_search MATCH ?)' : '';
    return (await db().prepare("SELECT id,title,subject,json_extract(quiz,'$.description') description,json_array_length(json_extract(quiz,'$.questions')) questions,copies FROM public_quizzes WHERE published=1" + filter + ' ORDER BY created DESC,id DESC LIMIT 21 OFFSET ?').bind(...(words.length ? [search] : []), offset).all()).results;
  },
  async copy({ sourceId, id, ownerId, quiz, created }) {
    await db().batch([db().prepare('INSERT INTO quizzes(id,title,subject,description,questions,created,owner_id,time_limit_minutes) VALUES(?,?,?,?,?,?,?,?)').bind(id, quiz.title, quiz.subject, quiz.description, JSON.stringify(quiz.questions), created, ownerId, quiz.timeLimitMinutes), db().prepare('UPDATE public_quizzes SET copies=copies+1 WHERE id=?').bind(sourceId)]);
    return true;
  },
  async unpublish(id) { await db().prepare('UPDATE public_quizzes SET published=0 WHERE id=?').bind(id).run(); },
  async publish({ id, ownerId, quiz, created }) { await db().prepare('INSERT INTO public_quizzes(id,owner_id,title,subject,quiz,published,created) VALUES(?,?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,subject=excluded.subject,quiz=excluded.quiz,published=1').bind(id, ownerId, quiz.title, quiz.subject, JSON.stringify(quiz), created).run(); },
  profile(userId) { return db().prepare('SELECT profile,updated FROM creator_profiles WHERE user_id=?').bind(userId).first(); },
  async saveProfile(userId, profile, updated) { await db().prepare('INSERT INTO creator_profiles(user_id,profile,updated) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET profile=excluded.profile,updated=excluded.updated').bind(userId, JSON.stringify(profile), updated).run(); },
};
let mariaStore: Promise<LibraryStore> | undefined;
export function libraryStore(): Promise<LibraryStore> {
  if ((env as any).QUIZMINT_RUNTIME !== 'namecheap') return Promise.resolve(workerStore);
  if (!mariaStore) mariaStore = Promise.all([import('../db/namecheap.mjs'), import('../db/namecheap-library.mjs')])
    .then(async ([database, library]) => library.libraryRepository(await database.namecheapDatabase()) as LibraryStore)
    .catch(error => { mariaStore = undefined; throw error; });
  return mariaStore;
}
