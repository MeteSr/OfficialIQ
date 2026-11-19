import { describe, expect, it } from "vitest";
import { crewMisses, crewPicks, playArticles, refresherPicks } from "./gameDay";

const p = (s: string) => ({ toString: () => s }) as any;

describe("refresherPicks", () => {
  it("draws rules questions from the weakest articles, adaptively", () => {
    const [rules, plays] = refresherPicks(["a3", "a1", "a7", "a9"], ["a1", "a2", "a3"], []);
    expect(rules).toMatchObject({ articleIds: ["a3", "a1", "a7"], casebook: false, count: 3n, adaptive: true });
    expect(plays).toMatchObject({ articleIds: ["a1", "a2", "a3"], casebook: true, count: 2n });
  });

  it("falls back to the whole level with no answer history", () => {
    const [rules] = refresherPicks([], ["a1", "a2"], []);
    expect(rules.articleIds).toEqual(["a1", "a2"]);
  });

  it("asks for five questions", () => {
    const total = refresherPicks(["a1"], ["a1"], []).reduce((n, pk) => n + Number(pk.count), 0);
    expect(total).toBe(5);
  });

  it("gives one rules slot to this season's rule changes when there are some (#68)", () => {
    const picks = refresherPicks(["a3", "a1"], ["a1", "a2", "a3"], [], { articleIds: ["a2"], tag: "rule-change:2026-27" });
    expect(picks[0]).toMatchObject({ articleIds: ["a2"], casebook: false, count: 1n, tag: ["rule-change:2026-27"] });
    expect(picks[1]).toMatchObject({ articleIds: ["a3", "a1"], casebook: false, count: 2n, tag: [] });
    expect(picks.reduce((n, pk) => n + Number(pk.count), 0)).toBe(5);
  });

  it("ignores a rule-change slot with no articles", () => {
    expect(refresherPicks(["a1"], ["a1"], [], { articleIds: [], tag: "rule-change:2026-27" })).toEqual(refresherPicks(["a1"], ["a1"], []));
  });
});

describe("playArticles", () => {
  it("prefers points of emphasis at the level", () => {
    expect(playArticles(["a1", "a2", "a3"], ["a2", "x9", "a2"])).toEqual(["a2"]);
  });
  it("uses the whole level when no emphasis article is at it", () => {
    expect(playArticles(["a1", "a2"], ["x9"])).toEqual(["a1", "a2"]);
  });
});

describe("crewPicks", () => {
  it("is not adaptive, so the set isn't tuned to the creator", () => {
    expect(crewPicks(["a1"], []).every(pk => !pk.adaptive)).toBe(true);
  });
});

describe("crewMisses", () => {
  it("counts misses per question among current members, most missed first", () => {
    const crew = {
      questionIds: ["q1", "q2", "q3"],
      members: [p("ann"), p("bo"), p("cy")],
      results: [
        { principal: p("ann"), score: 66n, missed: ["q2"], finishedAt: 0n },
        { principal: p("bo"), score: 33n, missed: ["q2", "q3"], finishedAt: 0n },
        // Left the crew: not counted.
        { principal: p("gone"), score: 0n, missed: ["q1", "q2", "q3"], finishedAt: 0n },
      ],
    };
    const { finished, misses } = crewMisses(crew);
    expect(finished).toBe(2);
    expect(misses.map(m => [m.questionId, m.missedBy.length])).toEqual([["q2", 2], ["q3", 1], ["q1", 0]]);
    expect(misses[0].missedBy).toEqual(["ann", "bo"]);
  });
});
