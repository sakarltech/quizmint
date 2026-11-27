import { env } from 'cloudflare:workers';
import { db } from './server';

type SessionStart = { id: string; quizId: string; tokenHash: string; student: string; snapshot: string; answers: string; deadline: number; now: number };
type SessionSave = { id: string; quizId: string; revision: number; answers: string; step: number; now: number };
type SessionFinish = { id: string; quizId: string; revision: number; result: string; answers: string; now: number; expired: boolean };
export interface QuizSessionStore {
  find(quizId: string, tokenHash: string): Promise<any>;
  start(input: SessionStart): Promise<boolean>;
  save(input: SessionSave): Promise<void>;
  finalize(input: SessionFinish): Promise<void>;
}
const workerStore: QuizSessionStore = {
  find(quizId, tokenHash) { return db().prepare('SELECT s.* FROM quiz_sessions s JOIN quizzes q ON q.id=s.quiz_id WHERE s.quiz_id=? AND s.token_hash=? AND q.active=1').bind(quizId, tokenHash).first(); },
  async start({ id, quizId, tokenHash, student, snapshot, answers, deadline, now }) {
    await db().prepare('INSERT INTO quiz_sessions(id,quiz_id,token_hash,student,snapshot,answers,deadline,started,updated) VALUES(?,?,?,?,?,?,?,?,?)').bind(id, quizId, tokenHash, student, snapshot, answers, deadline, now, now).run();
    return true;
  },
  async save({ id, revision, answers, step, now }) {
    await db().prepare("UPDATE quiz_sessions SET answers=?,step=?,updated=?,revision=revision+1 WHERE id=? AND revision=? AND result IS NULL AND (deadline=0 OR deadline>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) AND EXISTS(SELECT 1 FROM quizzes WHERE id=quiz_id AND active=1)").bind(answers, step, now, id, revision).run();
  },
  async finalize({ id, revision, result, answers, now, expired }) {
    await db().batch([
      db().prepare(`UPDATE quiz_sessions SET result=?,answers=?,updated=?,revision=revision+1 WHERE id=? AND revision=? AND result IS NULL AND EXISTS(SELECT 1 FROM quizzes WHERE id=quiz_id AND active=1) ${expired ? '' : "AND (deadline=0 OR deadline>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))"}`).bind(result, answers, now, id, revision),
      db().prepare("INSERT OR IGNORE INTO attempts(id,quiz_id,student,score,total,result,created) SELECT id,quiz_id,student,json_extract(result,'$.score'),json_extract(result,'$.total'),result,json_extract(result,'$.created') FROM quiz_sessions WHERE id=? AND result IS NOT NULL").bind(id),
    ]);
  },
};
let mariaStore: Promise<QuizSessionStore> | undefined;
export function quizSessionStore(): Promise<QuizSessionStore> {
  if ((env as any).QUIZMINT_RUNTIME !== 'namecheap') return Promise.resolve(workerStore);
  if (!mariaStore) mariaStore = Promise.all([import('../db/namecheap.mjs'), import('../db/namecheap-quiz-sessions.mjs')])
    .then(async ([database, sessions]) => sessions.quizSessionRepository(await database.namecheapDatabase()) as QuizSessionStore)
    .catch(error => { mariaStore = undefined; throw error; });
  return mariaStore;
}
