import { describe, expect, it } from "vitest";
import { CASEBOOK_SHARE, splitCount, mixedPicks } from "./quizMix";

describe("splitCount", () => {
  it("is all rule questions when casebook plays are left out", () => {
    expect(splitCount(10, false, 50, 20)).toEqual({ rules: 10, plays: 0 });
  });

  it("adds casebook plays to the rule questions when they're included", () => {
    expect(splitCount(10, true, 50, 20)).toEqual({ rules: 10 - Math.round(10 * CASEBOOK_SHARE), plays: Math.round(10 * CASEBOOK_SHARE) });
    expect(splitCount(5, true, 12, 4)).toEqual({ rules: 3, plays: 2 });
  });

  it("fills with rule questions when an article has few plays", () => {
    expect(splitCount(25, true, 40, 1)).toEqual({ rules: 24, plays: 1 });
    expect(splitCount(25, true, 12, 4)).toEqual({ rules: 12, plays: 4 });
  });

  it("fills with plays when an article has few rule questions", () => {
    expect(splitCount(10, true, 2, 20)).toEqual({ rules: 2, plays: 8 });
  });

  it("never asks for more than there is", () => {
    expect(splitCount(10, false, 3, 20)).toEqual({ rules: 3, plays: 0 });
    expect(splitCount(10, true, 0, 0)).toEqual({ rules: 0, plays: 0 });
  });
});

describe("mixedPicks", () => {
  it("makes one exam pick per kind of question, leaving out empty ones", () => {
    const base = { articleIds: ["s:art1"], difficulty: [] as [], adaptive: false, tag: [] as [] };
    expect(mixedPicks(base, { rules: 3, plays: 2 })).toEqual([
      { ...base, casebook: false, count: 3n },
      { ...base, casebook: true, count: 2n },
    ]);
    expect(mixedPicks(base, { rules: 5, plays: 0 })).toEqual([{ ...base, casebook: false, count: 5n }]);
  });
});
