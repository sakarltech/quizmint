import { env } from 'cloudflare:workers';
import { db } from './server';
import type { validateQuiz } from './quiz';
type Quiz = ReturnType<typeof validateQuiz>;

export type QuizOwner = { id: string | null; isAdmin: boolean };
type QuizRow = { id: string; title: string; subject: string; description: string; questions: string; active: number; created: string; owner_id: string | null; time_limit_minutes: number; [key: string]: any };
type AttemptResult = { student: string; score: number; total: number; created: string; [key: string]: any };
export interface QuizStore {
  get(id: string): Promise<QuizRow | null>;
  owns(id: string, owner: QuizOwner): Promise<boolean>;
  list(owner: QuizOwner, offset: number): Promise<any[]>;
  attempts(id: string, offset: number): Promise<any[]>;
  create(input: { id: string; quiz: Quiz; ownerId: string | null; created: string }): Promise<void>;
  setActive(id: string, active: boolean, owner: QuizOwner): Promise<void>;
  remove(id: string, owner: QuizOwner): Promise<boolean>;
  attempt(id: string, quizId: string): Promise<{ result: string } | null>;
  saveAttempt(input: { id: string; quizId: string; result: AttemptResult }): Promise<{ result: string } | null>;
}

const workerStore: QuizStore = {
  get(id) { return db().prepare('SELECT * FROM quizzes WHERE id=?').bind(id).first<QuizRow>(); },
  async owns(id, owner) { return Boolean(await db().prepare('SELECT id FROM quizzes WHERE id=? AND (?=1 OR owner_id=?)').bind(id, owner.isAdmin ? 1 : 0, owner.id).first()); },
  async list(owner, offset) {
    const filter = owner.isAdmin ? '1' : 'q.owner_id=?';
    const bindings = owner.isAdmin ? [] : [owner.id];
    return (await db().prepare(`WITH page AS (SELECT q.* FROM quizzes q WHERE ${filter} ORDER BY q.created DESC,q.id DESC LIMIT 26 OFFSET ?) SELECT q.*,(SELECT COUNT(*) FROM attempts a WHERE a.quiz_id=q.id) submissions,(SELECT AVG(100.0*a.score/a.total) FROM attempts a WHERE a.quiz_id=q.id) average,COALESCE((SELECT published FROM public_quizzes p WHERE p.id=q.id),0) libraryPublished FROM page q ORDER BY q.created DESC,q.id DESC`).bind(...bindings, offset).all()).results;
  },
  async attempts(id, offset) { return (await db().prepare('SELECT id,student,score,total,created FROM attempts WHERE quiz_id=? ORDER BY created DESC,id DESC LIMIT 101 OFFSET ?').bind(id, offset).all()).results; },
  async create({ id, quiz, ownerId, created }) { await db().prepare('INSERT INTO quizzes(id,title,subject,description,questions,created,owner_id,time_limit_minutes) VALUES(?,?,?,?,?,?,?,?)').bind(id, quiz.title, quiz.subject, quiz.description, JSON.stringify(quiz.questions), created, ownerId, quiz.timeLimitMinutes).run(); },
  async setActive(id, active, owner) { await db().prepare('UPDATE quizzes SET active=? WHERE id=? AND (?=1 OR owner_id=?)').bind(active ? 1 : 0, id, owner.isAdmin ? 1 : 0, owner.id).run(); },
  async remove(id, owner) {
    if (!await workerStore.owns(id, owner)) return false;
    await db().batch([db().prepare('DELETE FROM attempts WHERE quiz_id=?').bind(id), db().prepare('DELETE FROM quiz_sessions WHERE quiz_id=?').bind(id), db().prepare('DELETE FROM public_quizzes WHERE id=?').bind(id), db().prepare('DELETE FROM quizzes WHERE id=?').bind(id)]);
    return true;
  },
  attempt(id, quizId) { return db().prepare('SELECT result FROM attempts WHERE id=? AND quiz_id=?').bind(id, quizId).first<{ result: string }>(); },
  async saveAttempt({ id, quizId, result }) {
    await db().prepare('INSERT OR IGNORE INTO attempts(id,quiz_id,student,score,total,result,created) VALUES(?,?,?,?,?,?,?)').bind(id, quizId, result.student, result.score, result.total, JSON.stringify(result), result.created).run();
    return workerStore.attempt(id, quizId);
  },
};
let mariaStore: Promise<QuizStore> | undefined;
export function quizStore(): Promise<QuizStore> {
  if ((env as any).QUIZMINT_RUNTIME !== 'namecheap') return Promise.resolve(workerStore);
  if (!mariaStore) mariaStore = Promise.all([import('../db/namecheap.mjs'), import('../db/namecheap-quizzes.mjs')])
    .then(async ([database, quizzes]) => quizzes.quizRepository(await database.namecheapDatabase()) as QuizStore)
    .catch(error => { mariaStore = undefined; throw error; });
  return mariaStore;
}
