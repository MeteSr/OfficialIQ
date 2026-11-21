import { describe, expect, it } from "vitest";
import { sortByReadiness, type Readiness } from "./readiness";

const r = (label: Readiness["label"], score: number): Readiness => ({ label, score, trend: 0 });

describe("sortByReadiness", () => {
  it("puts the members who most need work first and those without enough data last", () => {
    const rows = [
      { name: "a", readiness: r("On Track", 90) },
      { name: "b", readiness: r("Not Enough Data", 40) },
      { name: "c", readiness: r("Needs Work", 55) },
      { name: "d", readiness: r("Borderline", 72) },
      { name: "e", readiness: r("Needs Work", 40) },
      { name: "f", readiness: r("On Track", 81) },
    ];
    expect(sortByReadiness(rows).map(x => x.name)).toEqual(["e", "c", "d", "f", "a", "b"]);
  });
  it("doesn't change the rows it's given", () => {
    const rows = [{ readiness: r("On Track", 90) }, { readiness: r("Needs Work", 10) }];
    sortByReadiness(rows);
    expect(rows[0].readiness.score).toBe(90);
  });
});
