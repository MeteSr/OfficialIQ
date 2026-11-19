// Certification readiness (issue #65): an estimate of how an official would
// do on their certification exam today, by rule section, and a day-by-day
// plan to the exam date. A transparent formula over their own answer
// history, weighted like the exam template, not a trained prediction; the
// UI says so. (lib/readiness.ts is the simpler exam-score trend that the
// Analytics pages use.)

export type Section = {
  articleId: string;
  /** The section's weight in the exam template (relative). */
  weight: number;
  answered: number;
  /** Estimated % correct on this section today. */
  estimate: number;
};

export type Readiness = {
  /** Weighted estimate, 0-100. */
  score: number;
  /** At or above the pass mark, with enough of the exam practised to say. */
  likelyPass: boolean;
  /** % of the exam's weight in sections with at least MIN_ANSWERS answers. */
  coverage: number;
  enoughData: boolean;
};

export type PlanDay = { date: string; kind: "study" | "practiceExam"; articleId: string | null };

/** Answers on a section before it counts as practised. */
export const MIN_ANSWERS = 5;
/** Share of the exam (by weight) that must be practised to give a verdict. */
const MIN_COVERAGE = 50;

/**
 * One row per weighted section. The estimate is (correct + 1) / (answered + 2),
 * so a section with a single lucky answer reads near 67%, not 100%, and an
 * unpractised one reads 50%.
 */
export function sections(
  weights: [string, bigint][],
  accuracy: Map<string, { correct: number; answered: number }>,
): Section[] {
  return weights
    .filter(([, w]) => w > 0n)
    .map(([articleId, w]) => {
      const a = accuracy.get(articleId) ?? { correct: 0, answered: 0 };
      return { articleId, weight: Number(w), answered: a.answered, estimate: Math.round((100 * (a.correct + 1)) / (a.answered + 2)) };
    });
}

export function readiness(secs: Section[], passThresholdPct: number): Readiness {
  const total = secs.reduce((n, s) => n + s.weight, 0);
  if (total === 0) return { score: 0, likelyPass: false, coverage: 0, enoughData: false };
  const score = Math.round(secs.reduce((n, s) => n + s.weight * s.estimate, 0) / total);
  const practised = secs.filter(s => s.answered >= MIN_ANSWERS).reduce((n, s) => n + s.weight, 0);
  const coverage = Math.round((100 * practised) / total);
  const enoughData = coverage >= MIN_COVERAGE;
  return { score, likelyPass: enoughData && score >= passThresholdPct, coverage, enoughData };
}

function localDay(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A plan from today to the day before the exam: study days on the sections
 * furthest below the pass mark (weighted by their share of the exam), mixed
 * rather than in blocks, then a full practice exam the day before. If every
 * section is above the mark, the days go to review by weight. Recomputed
 * from live estimates, so it changes as scores do.
 */
export function studyPlan(secs: Section[], passThresholdPct: number, today: number, examDate: number): PlanDay[] {
  const start = localDay(today);
  const days = Math.round((localDay(examDate).getTime() - start.getTime()) / 86_400_000);
  if (days <= 0) return [];
  const studyDays = days - 1;

  let priority = secs.map(s => s.weight * Math.max(0, passThresholdPct - s.estimate));
  if (priority.every(p => p === 0)) priority = secs.map(s => s.weight);
  const totalP = priority.reduce((a, b) => a + b, 0);

  // Days per section by largest remainder, so they add up exactly.
  const exact = priority.map(p => (totalP === 0 ? 0 : (studyDays * p) / totalP));
  const counts = exact.map(Math.floor);
  let left = studyDays - counts.reduce((a, b) => a + b, 0);
  for (const i of exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i)) {
    if (left <= 0) break;
    if (priority[i] > 0) { counts[i]++; left--; }
  }

  // Smooth weighted round-robin: interleaves sections in proportion.
  const current = priority.map(() => 0);
  const order: string[] = [];
  for (let n = 0; n < studyDays; n++) {
    let best = -1;
    for (let i = 0; i < secs.length; i++) {
      if (counts[i] === 0) continue;
      current[i] += priority[i];
      if (best === -1 || current[i] > current[best]) best = i;
    }
    if (best === -1) break;
    current[best] -= totalP;
    counts[best]--;
    order.push(secs[best].articleId);
  }

  const plan: PlanDay[] = [];
  for (let n = 0; n < days; n++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + n);
    plan.push(n === days - 1
      ? { date: iso(d), kind: "practiceExam", articleId: null }
      : { date: iso(d), kind: "study", articleId: order[n] ?? null });
  }
  return plan;
}
