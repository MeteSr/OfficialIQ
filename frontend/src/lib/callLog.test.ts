import { describe, expect, it } from "vitest";
import { buildCandidates, candidatesText, matchFor, parseSuggestion } from "./callLog";

const articles = [
  { id: "s:art10", number: 10n, title: "Fouls and penalties" },
  { id: "s:art4", number: 4n, title: "Definitions" },
];
const plays = [
  { id: "p1", articleId: "s:art10", citation: "10.6.1 Sit. A", scenario: "A1 establishes a legal guarding position before B1 leaves the floor and contact follows" },
];

describe("buildCandidates", () => {
  it("lists articles in rulebook order, then casebook plays", () => {
    const c = buildCandidates(articles, plays);
    expect(c.map(x => x.id)).toEqual(["s:art4", "s:art10", "play:p1"]);
    expect(c[2]).toMatchObject({ kind: "play", articleId: "s:art10", citation: "10.6.1 Sit. A", playId: "p1" });
    expect(c[0]).toMatchObject({ kind: "article", citation: "Art. 4", title: "Definitions" });
  });

  it("stops adding plays at the size budget, keeping every article", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, articleId: "s:art10", citation: `10.${i}`, scenario: "x".repeat(70) }));
    const c = buildCandidates(articles, many, 2_000);
    expect(c.filter(x => x.kind === "article")).toHaveLength(2);
    expect(candidatesText(c).length).toBeLessThanOrEqual(2_000);
    expect(c.length).toBeGreaterThan(2);
  });
});

describe("parseSuggestion", () => {
  const c = buildCandidates(articles, plays);

  it("reads the chosen candidate and the reason", () => {
    expect(parseSuggestion('{"id": "play:p1", "reason": "Legal guarding position before the shooter left the floor."}', c))
      .toEqual({ candidate: c[2], reason: "Legal guarding position before the shooter left the floor." });
  });

  it("tolerates a fenced or chatty reply", () => {
    expect(parseSuggestion('Here you go:\n```json\n{"id":"s:art10","reason":"Fouls."}\n```', c)?.candidate.id).toBe("s:art10");
  });

  it("refuses an id that wasn't offered, a null id, or junk", () => {
    expect(parseSuggestion('{"id": "s:art99", "reason": "made up"}', c)).toBeNull();
    expect(parseSuggestion('{"id": null, "reason": "none apply"}', c)).toBeNull();
    expect(parseSuggestion("no json here", c)).toBeNull();
    expect(parseSuggestion('{"id": ', c)).toBeNull();
  });
});

describe("matchFor", () => {
  it("turns a candidate into the match the canister stores", () => {
    const c = buildCandidates(articles, plays);
    expect(matchFor(c[2])).toEqual({ articleId: "s:art10", citation: "10.6.1 Sit. A", playId: ["p1"] });
    expect(matchFor(c[0])).toEqual({ articleId: "s:art4", citation: "Art. 4", playId: [] });
  });
});
