import { challengeService, type Crew } from "../services/challenge";
import { contentService } from "../services/content";
import { examService } from "../services/exam";
import { CREW_SEC_PER_Q, crewPicks, loadLevelContext, pickedArticleIds } from "./gameDay";

/** The join link a crew member shares with the rest of the crew. */
export function crewJoinUrl(code: string): string {
  return `${window.location.origin}/crew/join/${code}`;
}

/**
 * Opens a crew for a game. The exam canister picks the question set (as a
 * share link, so nobody, the creator included, sees the answers first), and
 * the challenge canister keeps the crew around that set.
 */
export async function createCrewForGame(game: { opponent: string; gameDateMs: number; sportId: string; levelId: string }): Promise<Crew> {
  const level = await loadLevelContext(game.sportId, game.levelId, {
    listArticles: (s, l) => contentService.listArticles(s, l),
    listPointsOfEmphasis: (s, season) => contentService.listPointsOfEmphasis(s, season),
  });
  const picks = crewPicks(level.articles.map(a => a.id), level.emphasisArticleIds);
  const token = await examService.createShareLink({
    sportId: game.sportId, articleIds: pickedArticleIds(picks), casebook: false,
    count: picks.reduce((n, p) => n + p.count, 0n), secPerQ: BigInt(CREW_SEC_PER_Q), mode: { ShareLink: null },
  }, picks);
  const link = await examService.getByShareToken(token);
  if (!link || link.questionIds.length === 0) throw new Error("No questions match this level yet");
  return challengeService.createCrew({
    gameLabel: game.opponent, gameDateMs: game.gameDateMs,
    sportId: game.sportId, levelId: game.levelId, questionIds: link.questionIds,
  });
}

/** The crew already opened for this game, if the official is in one. */
export function crewForGame(crews: Crew[], game: { opponent: string; gameDate: bigint }): Crew | undefined {
  return crews.find(c => c.gameLabel === game.opponent.trim() && c.gameDate === game.gameDate);
}
