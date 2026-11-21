// Training-hours transcript (issue #67): turns what the exam and user
// canisters record into dated entries, period totals and a check against an
// association's hour requirement. The time itself is measured by the
// canisters (exam: graded answer time capped by wall-clock time; user:
// study heartbeats); nothing here adds time the canisters didn't credit.

export type TrainingSessionLike = {
  id: string;
  mode: { Solo: null } | { ShareLink: null } | { Timed: null } | { Certification: null };
  questionCount: bigint;
  correct: bigint;
  score: bigint;
  creditedSec: bigint;
  finishedAt: bigint;
};

export type TrainingActivityLike = {
  studyDays: { day: bigint; seconds: bigint }[];
  weeklyQuizzes: { weekNumber: bigint; newScore: bigint; completedAt: bigint }[];
  monthlyQuizzes: { month: bigint; score: bigint; completedAt: bigint }[];
};

export type EntryKind = "study" | "quiz" | "certExam" | "weeklyQuiz" | "monthlyQuiz";

export type TranscriptEntry = {
  at: number;          // ms since epoch
  kind: EntryKind;
  seconds: number;     // credited training time
  score: number | null;
  questions: number | null;
};

export type PeriodTotal = { from: number; to: number; seconds: number; quizzes: number; exams: number };

export type Requirement = { hoursPerSeason: number; seasonStartMonth: number }; // month 1-12

const DAY_MS = 86_400_000;
const nsToMs = (ns: bigint) => Number(ns / 1_000_000n);

export function buildEntries(sessions: TrainingSessionLike[], activity: TrainingActivityLike | null): TranscriptEntry[] {
  const out: TranscriptEntry[] = sessions.map(s => ({
    at: nsToMs(s.finishedAt),
    kind: "Certification" in s.mode ? "certExam" : "quiz",
    seconds: Number(s.creditedSec),
    score: Number(s.score),
    questions: Number(s.questionCount),
  }));
  if (activity) {
    for (const d of activity.studyDays) {
      if (d.seconds > 0n) out.push({ at: Number(d.day) * DAY_MS, kind: "study", seconds: Number(d.seconds), score: null, questions: null });
    }
    // Weekly/monthly quizzes are listed for the record; their time is
    // already in the graded session they were taken in.
    for (const w of activity.weeklyQuizzes) {
      out.push({ at: nsToMs(w.completedAt), kind: "weeklyQuiz", seconds: 0, score: Number(w.newScore), questions: null });
    }
    for (const m of activity.monthlyQuizzes) {
      out.push({ at: nsToMs(m.completedAt), kind: "monthlyQuiz", seconds: 0, score: Number(m.score), questions: null });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

export function totalIn(entries: TranscriptEntry[], from: number, to: number): PeriodTotal {
  let seconds = 0, quizzes = 0, exams = 0;
  for (const e of entries) {
    if (e.at < from || e.at >= to) continue;
    seconds += e.seconds;
    if (e.kind === "certExam") exams++;
    else if (e.kind !== "study") quizzes++;
  }
  return { from, to, seconds, quizzes, exams };
}

/** The season (twelve months from the 1st of startMonth, local time) containing `now`. */
export function seasonWindow(now: number, startMonth: number): { from: number; to: number } {
  const d = new Date(now);
  const m = Math.min(12, Math.max(1, startMonth)) - 1;
  const year = d.getMonth() >= m ? d.getFullYear() : d.getFullYear() - 1;
  return { from: new Date(year, m, 1).getTime(), to: new Date(year + 1, m, 1).getTime() };
}

/** Calendar months, newest first, for the last `count` months including the current one. */
export function monthlyTotals(entries: TranscriptEntry[], now: number, count = 12): PeriodTotal[] {
  const d = new Date(now);
  const out: PeriodTotal[] = [];
  for (let i = 0; i < count; i++) {
    const from = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime();
    const to = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime();
    out.push(totalIn(entries, from, to));
  }
  return out;
}

export type RequirementStatus = { requiredSec: number; loggedSec: number; met: boolean; pct: number; from: number; to: number };

export function requirementStatus(entries: TranscriptEntry[], req: Requirement, now: number): RequirementStatus {
  const { from, to } = seasonWindow(now, req.seasonStartMonth);
  const loggedSec = totalIn(entries, from, to).seconds;
  const requiredSec = req.hoursPerSeason * 3600;
  return {
    requiredSec, loggedSec, from, to,
    met: loggedSec >= requiredSec,
    pct: requiredSec === 0 ? 100 : Math.min(100, Math.floor((loggedSec / requiredSec) * 100)),
  };
}

/** "3h 25m" / "45m". */
export function formatDuration(sec: number): string {
  const totalMin = Math.floor(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Hours with one decimal, for exports. */
export function hours(sec: number): string {
  return (sec / 3600).toFixed(1);
}

/** Mirrors Training.MAX_HOURS_PER_SEASON in backend/lib/Training.mo. */
export const MAX_HOURS_PER_SEASON = 2000;

/**
 * The coordinator's form input as a requirement to save: blank or 0 hours
 * clears it (null), anything but a whole number in range is an error key.
 */
export function parseRequirementInput(
  hoursText: string, seasonStartMonth: number,
): { ok: Requirement | null } | { error: string } {
  const text = hoursText.trim();
  if (text === "" || text === "0") return { ok: null };
  if (!/^\d+$/.test(text)) return { error: "assocTraining.invalidHours" };
  const hoursPerSeason = Number(text);
  if (hoursPerSeason > MAX_HOURS_PER_SEASON) return { error: "assocTraining.invalidHours" };
  return { ok: { hoursPerSeason, seasonStartMonth } };
}

export type SetRequirementError =
  | { associationNotFound: null } | { notCoordinator: null }
  | { invalidHours: null } | { invalidSeasonStartMonth: null } | { licenseRequired: null };

/** The message key for an error from association.setTrainingRequirement. */
export function requirementErrorKey(e: SetRequirementError): string {
  if ("associationNotFound" in e) return "assocAnalytics.notFound";
  if ("notCoordinator" in e) return "assocTraining.errNotCoordinator";
  if ("invalidHours" in e) return "assocTraining.invalidHours";
  if ("licenseRequired" in e) return "license.requiredTitle";
  return "assocTraining.errInvalidMonth";
}
