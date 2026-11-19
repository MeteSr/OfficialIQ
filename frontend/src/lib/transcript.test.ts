import { describe, expect, it } from "vitest";
import {
  buildEntries, formatDuration, monthlyTotals, parseRequirementInput, requirementErrorKey, requirementStatus, seasonWindow, totalIn,
} from "./transcript";

const ms = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const ns = (t: number) => BigInt(t) * 1_000_000n;

const session = (at: number, sec: number, cert = false) => ({
  id: `ex${at}`,
  mode: cert ? { Certification: null } : { Solo: null },
  questionCount: 10n, correct: 8n, score: 80n, creditedSec: BigInt(sec), finishedAt: ns(at),
}) as const;

describe("transcript", () => {
  const now = ms(2026, 11, 19);
  const entries = buildEntries(
    [session(ms(2026, 11, 2), 600), session(ms(2026, 9, 10), 1800, true), session(ms(2026, 6, 1), 3600)],
    {
      studyDays: [{ day: BigInt(Math.floor(ms(2026, 11, 3) / 86_400_000)), seconds: 1200n }, { day: 1n, seconds: 0n }],
      weeklyQuizzes: [{ weekNumber: 3n, newScore: 90n, completedAt: ns(ms(2026, 11, 4)) }],
      monthlyQuizzes: [],
    },
  );

  it("lists credited sessions, study days and quizzes newest first, skipping empty days", () => {
    expect(entries.map(e => e.kind)).toEqual(["weeklyQuiz", "study", "quiz", "certExam", "quiz"]);
    expect(entries[0].seconds).toBe(0);
  });

  it("totals a period", () => {
    const t = totalIn(entries, ms(2026, 11, 1), ms(2026, 12, 1));
    expect(t).toMatchObject({ seconds: 1800, quizzes: 2, exams: 0 });
  });

  it("finds the season around now from its start month", () => {
    expect(seasonWindow(now, 8)).toEqual({ from: new Date(2026, 7, 1).getTime(), to: new Date(2027, 7, 1).getTime() });
    expect(seasonWindow(ms(2026, 3, 1), 8).from).toBe(new Date(2025, 7, 1).getTime());
  });

  it("checks the hour requirement against the current season only", () => {
    const s = requirementStatus(entries, { hoursPerSeason: 1, seasonStartMonth: 8 }, now);
    expect(s.loggedSec).toBe(3600); // June's session is last season
    expect(s.met).toBe(true);
    expect(requirementStatus(entries, { hoursPerSeason: 2, seasonStartMonth: 8 }, now)).toMatchObject({ met: false, pct: 50 });
  });

  it("breaks the last months down", () => {
    const months = monthlyTotals(entries, now, 6);
    expect(months).toHaveLength(6);
    expect(months[0].seconds).toBe(1800);
    expect(months[2].seconds).toBe(1800);
  });

  it("formats durations", () => {
    expect(formatDuration(45 * 60)).toBe("45m");
    expect(formatDuration(3 * 3600 + 25 * 60 + 59)).toBe("3h 25m");
  });
});

describe("parseRequirementInput", () => {
  it("turns hours and a month into a requirement", () => {
    expect(parseRequirementInput("12", 8)).toEqual({ ok: { hoursPerSeason: 12, seasonStartMonth: 8 } });
  });
  it("treats blank or 0 hours as clearing it", () => {
    expect(parseRequirementInput("", 8)).toEqual({ ok: null });
    expect(parseRequirementInput(" 0 ", 8)).toEqual({ ok: null });
  });
  it("rejects fractions, negatives and text", () => {
    for (const h of ["1.5", "-3", "ten", "1e3"]) expect(parseRequirementInput(h, 8)).toEqual({ error: "assocTraining.invalidHours" });
  });
  it("rejects more hours than the canister allows", () => {
    expect(parseRequirementInput("2001", 8)).toEqual({ error: "assocTraining.invalidHours" });
  });
});

describe("requirementErrorKey", () => {
  it("maps each canister error to a message key", () => {
    expect(requirementErrorKey({ notCoordinator: null })).toBe("assocTraining.errNotCoordinator");
    expect(requirementErrorKey({ associationNotFound: null })).toBe("assocAnalytics.notFound");
    expect(requirementErrorKey({ invalidHours: null })).toBe("assocTraining.invalidHours");
    expect(requirementErrorKey({ invalidSeasonStartMonth: null })).toBe("assocTraining.errInvalidMonth");
  });
});
