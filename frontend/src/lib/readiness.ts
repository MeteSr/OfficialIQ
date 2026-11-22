// Shared "predicted certification readiness" heuristic — used by both the
// individual AnalyticsPage and the coordinator's AssociationAnalyticsPage so
// the two stay consistent. It's a transparent formula over real historical
// exam scores (recent average + short-term trend vs the sport's pass
// threshold), not a trained model — flagged as a heuristic in the UI.
export type Readiness = {
  score: number; // 0-100, recent average score
  label: "On Track" | "Borderline" | "Needs Work" | "Not Enough Data";
  trend: number; // recent avg minus prior avg; positive = improving
};

export function computeReadiness(scoresChronological: number[], passThresholdPct: number): Readiness {
  if (scoresChronological.length === 0) {
    return { score: 0, label: "Not Enough Data", trend: 0 };
  }
  const recent = scoresChronological.slice(-5);
  const prior = scoresChronological.slice(-10, -5);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgPrior = prior.length > 0 ? prior.reduce((a, b) => a + b, 0) / prior.length : avgRecent;
  const trend = avgRecent - avgPrior;

  if (scoresChronological.length < 3) {
    return { score: Math.round(avgRecent), label: "Not Enough Data", trend };
  }
  const label: Readiness["label"] =
    avgRecent >= passThresholdPct + 5 ? "On Track" :
    avgRecent >= passThresholdPct - 5 ? "Borderline" : "Needs Work";
  return { score: Math.round(avgRecent), label, trend };
}

const ORDER: Record<Readiness["label"], number> = { "Needs Work": 0, "Borderline": 1, "On Track": 2, "Not Enough Data": 3 };

/**
 * A coordinator's per-member readiness list (issue #78): those who most
 * need work first, then by recent average, lowest first; members without
 * enough exams last. Returns a new array.
 */
export function sortByReadiness<T extends { readiness: Readiness }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    ORDER[a.readiness.label] - ORDER[b.readiness.label] || a.readiness.score - b.readiness.score);
}
