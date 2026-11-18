import { contentService } from "../services/content";
import { questionService } from "../services/question";
import { userService } from "../services/user";
import {
  cacheArticles, cachePlays, cacheQuestions,
  getPendingActions, removePendingAction, type PendingAction,
} from "./offlineDb";

/**
 * Pulls the full content set (articles, casebook plays, questions) into
 * IndexedDB so the app is usable with no network afterward. Called once
 * after login; safe to call repeatedly since every store is keyed by id.
 */
export async function syncAllContent(sportId: string, levelId: string): Promise<void> {
  const articles = await contentService.listArticles(sportId, levelId);
  await cacheArticles(articles);

  const plays = (await Promise.all(articles.map(a => contentService.listPlays(a.id)))).flat();
  await cachePlays(plays);

  const [rules, casebook] = await Promise.all([
    questionService.sampleQuiz({ sportId, articleIds: [], casebook: false, difficulty: [], count: 500n }),
    questionService.sampleQuiz({ sportId, articleIds: [], casebook: true, difficulty: [], count: 500n }),
  ]);
  await cacheQuestions([...rules, ...casebook]);
}

async function replay(action: PendingAction): Promise<void> {
  switch (action.kind) {
    // Retired: scores are graded by the exam canister now, so a quiz taken
    // offline is practice and its queued result is dropped, not replayed.
    case "offlineExam":
    case "submitExam":
    case "recordExamResult":
      return;
    case "recordArticleStudied":
      await userService.recordArticleStudied(action.articleId, action.score);
      return;
    case "recordAnswer":
      await questionService.recordAnswer(action.questionId, action.isCorrect);
      return;
  }
}

let flushing = false;

/**
 * Replays queued offline actions in the order they were recorded. Safe to
 * call opportunistically (the 'online' event, or once at boot); re-entrant
 * calls while one is already running are ignored.
 */
export async function flushPendingActions(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const actions = await getPendingActions();
    for (const action of actions) {
      try {
        await replay(action);
        await removePendingAction(action.id);
      } catch {
        // Still offline, or the call failed again — stop here and retry
        // the remainder next time rather than reordering the queue.
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

let listenerRegistered = false;

/** Wires flushPendingActions to the 'online' event and runs it once at
 * startup if already online. Call once from the app root. */
export function registerOfflineSync(): void {
  if (listenerRegistered) return;
  listenerRegistered = true;
  window.addEventListener("online", () => { flushPendingActions().catch(() => {}); });
  if (navigator.onLine) flushPendingActions().catch(() => {});
}
