import type { DailyActivity, SkillCounters, UserStats } from "../services/ranking";
import type { WeeklyQuizResult } from "../services/user";
import type { Challenge } from "../services/challenge";

// Name and description come from i18n: badges.<id>.name / badges.<id>.description.
export type Badge = {
  id:     string;
  icon:   string;
  earned: boolean;
};

export function computeBadges(input: {
  dailyStreak:   DailyActivity | null;
  skills:        SkillCounters | null;
  stats:         UserStats | null;
  weeklyHistory: WeeklyQuizResult[];
  challenges:    Challenge[];
  myPrincipal:   string | null;
}): Badge[] {
  const longestStreak    = Number(input.dailyStreak?.longestStreak ?? 0n);
  const casebookTotal    = Number(input.skills?.casebookTotal ?? 0n);
  const casebookCorrect  = Number(input.skills?.casebookCorrect ?? 0n);
  const casebookAccuracy = casebookTotal > 0 ? casebookCorrect / casebookTotal : 0;
  const bestSpeedStreak  = Number(input.skills?.bestSpeedStreak ?? 0n);
  const examCount        = Number(input.stats?.examCount ?? 0n);
  const perfectWeek      = input.weeklyHistory.some(w => Number(w.newScore) === 100);

  const wins = input.challenges.filter(c => "Completed" in c.status && c.results.length === 2).filter(c => {
    const mine   = c.results.find(r => r.principal.toString() === input.myPrincipal);
    const theirs = c.results.find(r => r.principal.toString() !== input.myPrincipal);
    return mine && theirs && Number(mine.score) > Number(theirs.score);
  }).length;

  return [
    { id: "streak7", icon: "🔥", earned: longestStreak >= 7 },
    { id: "streak30", icon: "🔥", earned: longestStreak >= 30 },
    { id: "streak100", icon: "🔥", earned: longestStreak >= 100 },
    { id: "speedDemon", icon: "⚡", earned: bestSpeedStreak >= 10 },
    { id: "perfectWeek", icon: "💯", earned: perfectWeek },
    { id: "casebookKing", icon: "📖", earned: casebookTotal >= 20 && casebookAccuracy >= 0.9 },
    { id: "challenger", icon: "⚔️", earned: wins >= 10 },
    { id: "centuryClub", icon: "🎓", earned: examCount >= 100 },
  ];
}
