import { describe, expect, it } from "vitest";
import { MIN_ANSWERS, readiness, sections, studyPlan, type Section } from "./certReadiness";

const acc = (rows: [string, number, number][]) => new Map(rows.map(([id, correct, answered]) => [id, { correct, answered }]));

describe("sections", () => {
  it("turns weights and answer history into a smoothed estimate per section", () => {
    const s = sections([["a1", 2n], ["a2", 1n], ["a3", 1n]], acc([["a1", 9, 10], ["a2", 1, 4]]));
    expect(s.map(x => x.articleId)).toEqual(["a1", "a2", "a3"]);
    // (correct + 1) / (answered + 2): one lucky answer can't read as 100%.
    expect(s[0]).toMatchObject({ weight: 2, answered: 10, estimate: 83 });
    expect(s[1]).toMatchObject({ weight: 1, answered: 4, estimate: 33 });
    expect(s[2]).toMatchObject({ weight: 1, answered: 0, estimate: 50 });
  });

  it("drops sections with no weight", () => {
    expect(sections([["a1", 0n], ["a2", 3n]], acc([])).map(x => x.articleId)).toEqual(["a2"]);
  });
});

describe("readiness", () => {
  it("weights each section's estimate by its share of the exam", () => {
    const s: Section[] = [
      { articleId: "a1", weight: 3, answered: 20, estimate: 90 },
      { articleId: "a2", weight: 1, answered: 20, estimate: 50 },
    ];
    expect(readiness(s, 75)).toEqual({ score: 80, likelyPass: true, coverage: 100, enoughData: true });
  });

  it("says when too little of the exam has been practised to judge", () => {
    const s: Section[] = [
      { articleId: "a1", weight: 1, answered: MIN_ANSWERS, estimate: 90 },
      { articleId: "a2", weight: 3, answered: MIN_ANSWERS - 1, estimate: 90 },
    ];
    const r = readiness(s, 75);
    expect(r.coverage).toBe(25);
    expect(r.enoughData).toBe(false);
  });

  it("is below the bar when the weighted estimate is", () => {
    expect(readiness([{ articleId: "a1", weight: 1, answered: 30, estimate: 70 }], 75).likelyPass).toBe(false);
  });

  it("handles a template with no sections", () => {
    expect(readiness([], 75)).toEqual({ score: 0, likelyPass: false, coverage: 0, enoughData: false });
  });
});

describe("studyPlan", () => {
  const day = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
  const weak: Section[] = [
    { articleId: "strong", weight: 1, answered: 30, estimate: 95 },
    { articleId: "weakHeavy", weight: 3, answered: 30, estimate: 55 },
    { articleId: "weakLight", weight: 1, answered: 30, estimate: 60 },
  ];

  it("ends with a practice exam the day before, and nothing on exam day", () => {
    const plan = studyPlan(weak, 75, day("2026-11-01"), day("2026-11-06"));
    expect(plan.map(p => p.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(plan[plan.length - 1]).toEqual({ date: "2026-11-05", kind: "practiceExam", articleId: null });
  });

  it("gives the days to the sections furthest below the bar, weighted, and none to ones above it", () => {
    const plan = studyPlan(weak, 75, day("2026-11-01"), day("2026-11-12"));
    const study = plan.filter(p => p.kind === "study").map(p => p.articleId);
    expect(study).toHaveLength(10);
    expect(study).not.toContain("strong");
    const heavy = study.filter(a => a === "weakHeavy").length;
    expect(heavy).toBeGreaterThan(study.filter(a => a === "weakLight").length);
    // Interleaved, not one section's block after another.
    expect(study.slice(0, 4)).toContain("weakLight");
  });

  it("reviews by weight once every section is above the bar", () => {
    const strong: Section[] = [
      { articleId: "big", weight: 3, answered: 30, estimate: 90 },
      { articleId: "small", weight: 1, answered: 30, estimate: 90 },
    ];
    const study = studyPlan(strong, 75, day("2026-11-01"), day("2026-11-06")).filter(p => p.kind === "study").map(p => p.articleId);
    expect(study).toHaveLength(4);
    expect(study.filter(a => a === "big").length).toBeGreaterThanOrEqual(3);
  });

  it("is just the practice exam the day before, and empty on or after exam day", () => {
    expect(studyPlan(weak, 75, day("2026-11-05"), day("2026-11-06"))).toEqual([{ date: "2026-11-05", kind: "practiceExam", articleId: null }]);
    expect(studyPlan(weak, 75, day("2026-11-06"), day("2026-11-06"))).toEqual([]);
    expect(studyPlan(weak, 75, day("2026-11-08"), day("2026-11-06"))).toEqual([]);
  });

  it("changes as scores change", () => {
    const before = studyPlan(weak, 75, day("2026-11-01"), day("2026-11-04"));
    const improved = weak.map(s => s.articleId === "weakHeavy" ? { ...s, estimate: 95 } : s);
    const after = studyPlan(improved, 75, day("2026-11-01"), day("2026-11-04"));
    expect(before.filter(p => p.articleId === "weakHeavy").length).toBeGreaterThan(0);
    expect(after.filter(p => p.articleId === "weakHeavy").length).toBe(0);
  });
});
