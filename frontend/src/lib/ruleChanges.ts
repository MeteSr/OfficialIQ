// "What changed this season" (issue #68). Seasons run from August 1, the
// app's "2026-27" convention (StudyPage, AssociationAnalyticsPage).

const SEASON_START_MONTH = 7; // August, 0-based
const HOME_WEEKS = 8;

/** The season `now` falls in, e.g. "2026-27". */
export function currentSeason(now: number): string {
  const d = new Date(now);
  const start = d.getMonth() >= SEASON_START_MONTH ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The question tag for a season's rule-change quiz (question.setQuestionTags). */
export function ruleChangeTag(season: string): string {
  return `rule-change:${season}`;
}

/** Home shows the season's changes for its first few weeks, if there are any. */
export function showRuleChangesOnHome(now: number, changeCount: number): boolean {
  if (changeCount === 0) return false;
  const d = new Date(now);
  const startYear = d.getMonth() >= SEASON_START_MONTH ? d.getFullYear() : d.getFullYear() - 1;
  const seasonStart = new Date(startYear, SEASON_START_MONTH, 1).getTime();
  return now - seasonStart < HOME_WEEKS * 7 * 86_400_000;
}

/**
 * The rule changes the game-day refresher includes (#68, #63): in the
 * season's first weeks (as on Home), the changed articles and the season's
 * question tag; otherwise null.
 */
export function refresherRuleChanges(now: number, changes: { articleId: string }[]): { articleIds: string[]; tag: string } | null {
  if (!showRuleChangesOnHome(now, changes.length)) return null;
  return { articleIds: [...new Set(changes.map(c => c.articleId))], tag: ruleChangeTag(currentSeason(now)) };
}
