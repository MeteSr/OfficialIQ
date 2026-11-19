import { contentService } from "../services/content";
import { questionService } from "../services/question";
import { userService } from "../services/user";
import { rankingService } from "../services/ranking";
import { associationService } from "../services/association";
import {
  cacheArticles, cachePlays, cacheQuestions,
  enqueuePendingAction, getPendingActions, removePendingAction, type PendingAction,
} from "./offlineDb";

/**
 * Pulls the full content set (articles, casebook plays, questions) into
 * IndexedDB so the app is usable with no network afterward. Called once
 * after login; safe to call repeatedly since every store is keyed by id.
 */
export async function syncAllContent(sportId: string, levelId: string): Promise<void> {
  const articles = await contentService.listArticles(sportId, levelId);
  await cacheArticles(articles);

  await cachePlays(await contentService.listPlaysFor(articles.map(a => a.id)));
  await cacheQuestions(await questionService.listAllForSync(sportId));
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
    // Queued by older versions of the app; the exam canister now pushes
    // results to ranking itself, which counts each session once.
    case "claimExamResult":
      await rankingService.claimExamResult(action.sessionId, action.displayName, action.state);
      return;
    case "recordGradedCompletion":
      await associationService.recordGradedCompletion(action.assignmentId, action.sessionId);
      return;
  }
}

/**
 * Counts a finished graded session toward a coordinator's assignment. A
 * failed call is queued and replayed like other offline actions; the
 * association canister uses each session once, so a replay of a call that
 * did land is refused and dropped.
 */
export async function recordAssignmentCompletion(assignmentId: string, sessionId: string): Promise<void> {
  try {
    await associationService.recordGradedCompletion(assignmentId, sessionId);
  } catch (e) {
    if (!isTransient(e)) return;
    await enqueuePendingAction({ kind: "recordGradedCompletion", assignmentId, sessionId }).catch(() => {});
  }
}

/**
 * Whether a failed call is worth retrying: no network, or the request
 * never got an answer. A canister that answered with a refusal or a trap
 * will answer the same way next time.
 */
export function isTransient(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (e instanceof TypeError) return true;
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /fetch|network|timeout|timed out|transport|offline|ECONN|status (?:429|5\d\d)/i.test(msg);
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
      } catch (e) {
        // Still offline, or no answer: stop here and retry the remainder
        // next time rather than reordering the queue.
        if (isTransient(e)) break;
        // The canister refused it (already counted, no longer valid ...).
        // Retrying can't help, and keeping it would block everything
        // queued after it forever.
      }
      await removePendingAction(action.id);
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
