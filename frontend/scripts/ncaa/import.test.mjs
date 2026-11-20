import { describe, expect, it } from "vitest";
import { buildBasketball, buildFootball, citedArticles, checkEdition, ruleNumberOf } from "./import.mjs";

// Parsed-book shapes as basketball.mjs / football.mjs return them, with
// invented text. Nothing here is NCAA wording.
const edition = { sportId: "s_bb", season: "2030-31", source: "2030-31 Test Rules Book" };

describe("citations", () => {
  it("finds the rule a citation is under", () => {
    expect(ruleNumberOf("Rule 1-17.6")).toBe(1);
    expect(ruleNumberOf("Rule 9-1-3 Penalty")).toBe(9);
    expect(ruleNumberOf("Rules 10-1 and 2-3")).toBe(10);
    expect(ruleNumberOf("no rule")).toBeNull();
  });

  it("links the articles a passage cites, in order, once each, only rules that exist", () => {
    expect(citedArticles("s", "See Rule 10.1.4 and (Rules 2-3, 4-5) then Rule 10-2; Rule 99-1.", [2, 4, 10])).toEqual(["s:art10", "s:art2", "s:art4"]);
  });
});

describe("buildBasketball", () => {
  const rulesBook = {
    rules: [{ number: 1, title: "Court", body: "SECTION 1. A" }, { number: 2, title: "Officials", body: "SECTION 1. B" }],
    changes: [{ title: "Widgets", citation: "Rule 1-2.3", text: "Widgets – (Rule 1-2.3) – Two." }],
    emphasis: [{ title: "Rule 2-1 and Spacing", body: "Rule 2-1 and Spacing – Watch." }, { title: "Mechanics", body: "Mechanics – Move." }],
    report: { unresolved: [], dropped: [] },
  };
  const caseBook = {
    plays: [{ ruleNumber: 2, citation: "A.R. 2–1 (Rule 2-1)", scenario: "Facts.", ruling: "Legal." }],
    report: { unresolved: [] },
  };
  const out = buildBasketball(edition, rulesBook, caseBook);

  it("makes one article per rule and every rule's plays (none is an empty set)", () => {
    expect(out.articles).toEqual([
      { sportId: "s_bb", levelId: "varsity", number: 1, title: "Court", body: "SECTION 1. A", language: "en" },
      { sportId: "s_bb", levelId: "varsity", number: 2, title: "Officials", body: "SECTION 1. B", language: "en" },
    ]);
    expect(out.plays).toEqual({
      "s_bb:art1": [],
      "s_bb:art2": [{ articleId: "s_bb:art2", citation: "A.R. 2–1 (Rule 2-1)", scenario: "Facts.", ruling: "Legal.", diagram: [] }],
    });
  });

  it("keeps each change's text as the book has it, with no old wording to compare", () => {
    expect(out.ruleChanges).toEqual([{
      sportId: "s_bb", season: "2030-31", articleId: "s_bb:art1", citation: "Rule 1-2.3", title: "Widgets",
      oldText: "", newText: "Widgets – (Rule 1-2.3) – Two.", summary: "", source: "2030-31 Test Rules Book",
    }]);
  });

  it("makes the points of emphasis, linked to the rules they cite", () => {
    expect(out.emphasis).toEqual([
      { season: "2030-31", title: "Rule 2-1 and Spacing", body: "Rule 2-1 and Spacing – Watch.", linkedArticleIds: ["s_bb:art2"] },
      { season: "2030-31", title: "Mechanics", body: "Mechanics – Move.", linkedArticleIds: [] },
    ]);
  });
});

describe("buildFootball", () => {
  const book = {
    rules: [{ number: 9, title: "Conduct", body: "SECTION 1. C" }],
    changes: [{ citation: "Rule 9-1-3 Penalty", text: "Penalty adjusted." }],
    emphasis: [{ title: "TARGETING", body: "See (Rule 9-1-3)." }],
    plays: [{ ruleNumber: 9, citation: "A.R. 9-1-3-I", scenario: "Facts.", ruling: "Foul." }],
    report: { unresolved: [] },
  };
  const replay = { plays: [{ ruleNumber: 12, citation: "Instant Replay Case Book 1 (Kick)", scenario: "Facts.", ruling: "Reviewable.", lead: "" }], report: { unresolved: [] } };
  const out = buildFootball({ sportId: "s_fb", season: "2030-31", source: "2030 Test Football Rules Book" }, { ...book, rules: [...book.rules, { number: 12, title: "Instant Replay", body: "SECTION 1. R" }] }, replay);

  it("adds the replay case book's plays to Rule 12", () => {
    expect(out.plays["s_fb:art12"]).toEqual([{ articleId: "s_fb:art12", citation: "Instant Replay Case Book 1 (Kick)", scenario: "Facts.", ruling: "Reviewable.", diagram: [] }]);
  });

  it("titles a change by its summary, which is all the table gives", () => {
    expect(out.ruleChanges).toEqual([{
      sportId: "s_fb", season: "2030-31", articleId: "s_fb:art9", citation: "Rule 9-1-3 Penalty", title: "Penalty adjusted.",
      oldText: "", newText: "Penalty adjusted.", summary: "", source: "2030 Test Football Rules Book",
    }]);
    expect(out.emphasis[0].linkedArticleIds).toEqual(["s_fb:art9"]);
    expect(out.plays["s_fb:art9"]).toHaveLength(1);
  });
});

describe("checkEdition", () => {
  it("refuses an edition with unsettled hyphens, failed checks or missing parts", () => {
    const fine = { rules: [{}], plays: { a: [{}] }, failed: [], unresolved: [] };
    expect(checkEdition("x", fine)).toEqual([]);
    expect(checkEdition("x", { ...fine, failed: ["A.R. 1–2"] })).toEqual(["x: differs from the book's text: A.R. 1–2"]);
    expect(checkEdition("x", { ...fine, unresolved: [{ left: "a-", right: "b", where: "Rule 1" }] }))
      .toEqual(["x: line-end hyphen not settled: a-|b (Rule 1); review it and add it to hyphenation.json"]);
    expect(checkEdition("x", { ...fine, rules: [] })).toEqual(["x: no rules found"]);
    expect(checkEdition("x", { ...fine, plays: { a: [] } })).toEqual(["x: no approved rulings found"]);
  });
});
