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
    }
  | {
      id: string; kind: "recordAnswer"; createdAt: number;
      questionId: string; isCorrect: boolean;
    };

export type AudioBlobRecord = { id: string; bytes: Uint8Array; sizeBytes: number; downloadedAt: number };

interface OfflineSchema extends DBSchema {
  articles: { key: string; value: Article };
  plays: { key: string; value: CasebookPlay; indexes: { articleId: string } };
  questions: { key: string; value: Question; indexes: { articleId: string } };
  audioBlobs: { key: string; value: AudioBlobRecord };
  pendingActions: { key: string; value: PendingAction };
}

const DB_NAME = "officialiq-offline";
const DB_VERSION = 2;

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
        if (!db.objectStoreNames.contains("audioBlobs")) {
          db.createObjectStore("audioBlobs", { keyPath: "id" });
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

// ─── Downloaded audio ─────────────────────────────────────────────────────────
// A "download" is an explicit, user-triggered opt-in (per article, from the
// Study page) — distinct from the automatic text/question sync in
// syncAllContent(), which is small and always kept warm for basic offline use.

export async function saveAudioBlob(id: string, bytes: Uint8Array): Promise<void> {
  const db = await getDb();
  await db.put("audioBlobs", { id, bytes, sizeBytes: bytes.byteLength, downloadedAt: Date.now() });
}

export async function getCachedAudioBlob(id: string): Promise<Uint8Array | undefined> {
  const db = await getDb();
  const rec = await db.get("audioBlobs", id);
  return rec?.bytes;
}

export async function isAudioDownloaded(id: string): Promise<boolean> {
  const db = await getDb();
  return (await db.getKey("audioBlobs", id)) !== undefined;
}

export async function getDownloadedAudioIds(): Promise<string[]> {
  const db = await getDb();
  return db.getAllKeys("audioBlobs");
}

export async function deleteAudioBlob(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("audioBlobs", id);
}

export type StorageBreakdown = {
  articlesBytes:  number;
  questionsBytes: number;
  audioBytes:     number;
  totalBytes:     number;
  quotaBytes:     number;
};

const DEFAULT_QUOTA_BYTES = 500 * 1024 * 1024; // shown as "of 500 MB" when the Storage API isn't available

// Article/Question records carry bigint fields, which JSON.stringify can't
// serialize on its own — stringify them for sizing purposes only.
function jsonByteSize(value: unknown): number {
  return new Blob([JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v))]).size;
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const db = await getDb();
  const [articles, questions, audioRecords] = await Promise.all([
    db.getAll("articles"),
    db.getAll("questions"),
    db.getAll("audioBlobs"),
  ]);
  const articlesBytes  = jsonByteSize(articles);
  const questionsBytes = jsonByteSize(questions);
  const audioBytes     = audioRecords.reduce((sum, r) => sum + r.sizeBytes, 0);
  const totalBytes     = articlesBytes + questionsBytes + audioBytes;

  let quotaBytes = DEFAULT_QUOTA_BYTES;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota) quotaBytes = estimate.quota;
  } catch {
    // Storage API unavailable — keep the default.
  }

  return { articlesBytes, questionsBytes, audioBytes, totalBytes, quotaBytes };
}

// Clears all downloaded/cached content (articles, plays, questions, audio)
// but leaves the pending-actions queue intact — those still need to sync.
// Text/question content re-syncs automatically on next login (syncAllContent);
// audio does not, since it's an explicit per-article opt-in.
export async function clearAllDownloads(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.clear("articles"),
    db.clear("plays"),
    db.clear("questions"),
    db.clear("audioBlobs"),
  ]);
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
