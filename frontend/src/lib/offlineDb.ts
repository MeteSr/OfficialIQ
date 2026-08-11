import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Article, CasebookPlay } from "../services/content";
import type { Question } from "../services/question";
import type { ExamConfig, AnswerRecord } from "../services/exam";

// ─── Pending actions queue ──────────────────────────────────────────────────
// Anything that needs a canister call but failed (offline, or any other
// transient error) gets queued here and replayed on reconnect. Each variant
// carries exactly what's needed to redo the original call.

export type PendingAction =
  | {
      id: string; kind: "offlineExam"; createdAt: number;
      config: ExamConfig; questionIds: string[]; answers: AnswerRecord[];
    }
  | {
      id: string; kind: "submitExam"; createdAt: number;
      sessionId: string; answers: AnswerRecord[];
    }
  | {
      id: string; kind: "recordExamResult"; createdAt: number;
      score: number; questionCount: number; displayName: string; sport: string; state: string; avgElapsedSec: number;
    }
  | {
      id: string; kind: "recordArticleStudied"; createdAt: number;
      articleId: string; score: number;
    };

interface OfflineSchema extends DBSchema {
  articles: { key: string; value: Article };
  plays: { key: string; value: CasebookPlay; indexes: { articleId: string } };
  questions: { key: string; value: Question; indexes: { articleId: string } };
  pendingActions: { key: string; value: PendingAction };
}

const DB_NAME = "officialiq-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OfflineSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<OfflineSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("articles")) {
          db.createObjectStore("articles", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("plays")) {
          db.createObjectStore("plays", { keyPath: "id" }).createIndex("articleId", "articleId");
        }
        if (!db.objectStoreNames.contains("questions")) {
          db.createObjectStore("questions", { keyPath: "id" }).createIndex("articleId", "articleId");
        }
        if (!db.objectStoreNames.contains("pendingActions")) {
          db.createObjectStore("pendingActions", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

// ─── Content cache ───────────────────────────────────────────────────────────

export async function cacheArticles(articles: Article[]): Promise<void> {
  if (articles.length === 0) return;
  const db = await getDb();
  const tx = db.transaction("articles", "readwrite");
  await Promise.all(articles.map(a => tx.store.put(a)));
  await tx.done;
}

export async function getCachedArticles(): Promise<Article[]> {
  const db = await getDb();
  return db.getAll("articles");
}

export async function cachePlays(plays: CasebookPlay[]): Promise<void> {
  if (plays.length === 0) return;
  const db = await getDb();
  const tx = db.transaction("plays", "readwrite");
  await Promise.all(plays.map(p => tx.store.put(p)));
  await tx.done;
}

export async function getCachedPlays(articleId: string): Promise<CasebookPlay[]> {
  const db = await getDb();
  return db.getAllFromIndex("plays", "articleId", articleId);
}

export async function cacheQuestions(questions: Question[]): Promise<void> {
  if (questions.length === 0) return;
  const db = await getDb();
  const tx = db.transaction("questions", "readwrite");
  await Promise.all(questions.map(q => tx.store.put(q)));
  await tx.done;
}

export async function getCachedQuestion(id: string): Promise<Question | undefined> {
  const db = await getDb();
  return db.get("questions", id);
}

/** Mirrors question.sampleQuiz's filter shape closely enough for offline use. */
export async function getCachedQuestionsFor(
  articleIds: string[], casebook: boolean, count: number,
): Promise<Question[]> {
  const db = await getDb();
  const all = articleIds.length === 0
    ? await db.getAll("questions")
    : (await Promise.all(articleIds.map(id => db.getAllFromIndex("questions", "articleId", id)))).flat();
  return all.filter(q => q.isCasebook === casebook).slice(0, count);
}

// ─── Pending actions queue ───────────────────────────────────────────────────

// Plain `Omit` doesn't distribute over a discriminated union — it collapses
// to the fields common to every variant (just `kind` here), stripping out
// each variant's own fields. This distributes over the union first.
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export async function enqueuePendingAction(action: DistributiveOmit<PendingAction, "id" | "createdAt"> & { id?: string }): Promise<void> {
  const db = await getDb();
  const full = { ...action, id: action.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: Date.now() } as PendingAction;
  await db.put("pendingActions", full);
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const db = await getDb();
  const all = await db.getAll("pendingActions");
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removePendingAction(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("pendingActions", id);
}

export async function pendingActionCount(): Promise<number> {
  const db = await getDb();
  return db.count("pendingActions");
}
