// Question selection for the game-day refresher (#63) and crew pregame
// (#64). Both are graded exam sessions; these build the "picks" the exam
// canister fills from the question bank (see backend/question pickForExam).
import type { Pick } from "../services/exam";
import type { Crew } from "../services/challenge";

// Season whose points of emphasis drive "plays at this level" (was local to SchedulePage).
export const CURRENT_SEASON = "2025-26";

export const REFRESHER_SEC_PER_Q = 60; // 5 questions, about 5 minutes
export const CREW_SEC_PER_Q = 45;

/** The articles to draw "plays at this level" from: this season's points of emphasis at the level, else the whole level. */
export function playArticles(levelArticleIds: string[], emphasisArticleIds: string[]): string[] {
  const level = new Set(levelArticleIds);
  const emphasis = emphasisArticleIds.filter(id => level.has(id));
  return emphasis.length > 0 ? [...new Set(emphasis)] : levelArticleIds;
}

/**
 * Three rules questions from the articles this official misses most (most
 * overdue first, so recent misses lead), then two casebook plays at the
 * game's level. With no answer history yet, the rules questions come from
 * the whole level instead.
 */
export function refresherPicks(weakArticleIds: string[], levelArticleIds: string[], emphasisArticleIds: string[]): Pick[] {
  const weak = weakArticleIds.slice(0, 3);
  return [
    { articleIds: weak.length > 0 ? weak : levelArticleIds, casebook: false, count: 3n, difficulty: [], adaptive: true, tag: [] },
    { articleIds: playArticles(levelArticleIds, emphasisArticleIds), casebook: true, count: 2n, difficulty: [], adaptive: false, tag: [] },
  ];
}

/** Six questions the whole crew shares: three rules, three plays at the level. Not adaptive, so not tuned to whoever created it. */
export function crewPicks(levelArticleIds: string[], emphasisArticleIds: string[]): Pick[] {
  return [
    { articleIds: levelArticleIds, casebook: false, count: 3n, difficulty: [], adaptive: false, tag: [] },
    { articleIds: playArticles(levelArticleIds, emphasisArticleIds), casebook: true, count: 3n, difficulty: [], adaptive: false, tag: [] },
  ];
}

export type CrewMiss = { questionId: string; missedBy: string[] };

/**
 * For each of the crew's questions, which current members missed it, most
 * missed first (ties keep question order). Only members who have finished
 * count; a member who left drops out.
 */
export function crewMisses(crew: Pick_<Crew, "questionIds" | "members" | "results">): { finished: number; misses: CrewMiss[] } {
  const members = new Set(crew.members.map(m => m.toString()));
  const results = crew.results.filter(r => members.has(r.principal.toString()));
  const misses = crew.questionIds.map(questionId => ({
    questionId,
    missedBy: results.filter(r => r.missed.includes(questionId)).map(r => r.principal.toString()),
  }));
  const order = new Map(crew.questionIds.map((id, i) => [id, i]));
  misses.sort((a, b) => b.missedBy.length - a.missedBy.length || order.get(a.questionId)! - order.get(b.questionId)!);
  return { finished: results.length, misses };
}

type Pick_<T, K extends keyof T> = { [P in K]: T[P] };

/** A game time from the canister (nanoseconds) as JS milliseconds. */
export function gameTimeMs(gameDateNs: bigint | number): number {
  return Number(gameDateNs) / 1e6;
}

/** Everything a refresher or crew quiz needs about the level, fetched once. */
export async function loadLevelContext(
  sportId: string, levelId: string,
  deps: {
    listArticles: (sportId: string, levelId: string) => Promise<{ id: string; title: string }[]>;
    listPointsOfEmphasis: (season: string) => Promise<{ linkedArticleIds: string[] }[]>;
  },
): Promise<{ articles: { id: string; title: string }[]; emphasisArticleIds: string[] }> {
  const [articles, poes] = await Promise.all([
    deps.listArticles(sportId, levelId),
    deps.listPointsOfEmphasis(CURRENT_SEASON).catch(() => []),
  ]);
  return { articles, emphasisArticleIds: poes.flatMap(p => p.linkedArticleIds) };
}

/** Every article id a set of picks draws from, for the session's config. */
export function pickedArticleIds(picks: Pick[]): string[] {
  return [...new Set(picks.flatMap(p => p.articleIds))];
}
