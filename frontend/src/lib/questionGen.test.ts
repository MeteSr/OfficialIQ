import { describe, expect, it } from "vitest";
import { casebookRequest, generatedTag, parseGenerated, playBatches, ruleSections, sectionRequest } from "./questionGen";

// Invented rule text; the real books are only in the canisters.
const article = {
  id: "s:art4", number: 4n, title: "Definitions",
  body: ["Intro line.", "SECTION 1. BALL", "Art. 1. A ball is round.", "SECTION 2. COURT", "Art. 1. A court is flat.", "Art. 2. It has lines."].join("\n"),
};

describe("ruleSections", () => {
  it("splits a rule at its sections, the lines before the first going with it", () => {
    expect(ruleSections(article)).toEqual([
      { key: "s:art4:s1", label: "SECTION 1. BALL", context: "Rule 4 — Definitions\nIntro line.\nSECTION 1. BALL\nArt. 1. A ball is round." },
      { key: "s:art4:s2", label: "SECTION 2. COURT", context: "Rule 4 — Definitions\nSECTION 2. COURT\nArt. 1. A court is flat.\nArt. 2. It has lines." },
    ]);
  });

  it("splits a section too long for one request into parts, at paragraphs", () => {
    const long = { ...article, body: ["SECTION 1. BALL", "a".repeat(30), "b".repeat(30), "c".repeat(30)].join("\n") };
    const parts = ruleSections(long, 80);
    expect(parts.map(p => p.label)).toEqual(["SECTION 1. BALL (part 1)", "SECTION 1. BALL (part 2)"]);
    expect(parts.map(p => p.key)).toEqual(["s:art4:s1p1", "s:art4:s1p2"]);
    expect(parts[1].context).toBe(`Rule 4 — Definitions\nSECTION 1. BALL (continued)\n${"c".repeat(30)}`);
  });

  it("keeps a rule with no sections whole", () => {
    expect(ruleSections({ ...article, body: "Just text." })).toEqual([
      { key: "s:art4:s0", label: "Rule 4", context: "Rule 4 — Definitions\nJust text." },
    ]);
  });
});

describe("requests", () => {
  it("asks for questions on a section, citing its rule", () => {
    const r = sectionRequest(ruleSections(article)[0], 4, 5);
    expect(r.count).toBe(5);
    expect(r.instructions).toMatch(/Rule 4/);
    expect(r.context).toContain("SECTION 1. BALL");
  });

  it("asks one question per approved ruling, cited by its citation", () => {
    const plays = [
      { citation: "A.R. 4–1 (Rule 4-1)", scenario: "Facts one.", ruling: "Ruling one." },
      { citation: "A.R. 4–2", scenario: "Facts two.", ruling: "Ruling two." },
    ];
    const r = casebookRequest(plays);
    expect(r.count).toBe(2);
    expect(r.context).toBe("[A.R. 4–1 (Rule 4-1)]\nPlay: Facts one.\nRuling: Ruling one.\n\n[A.R. 4–2]\nPlay: Facts two.\nRuling: Ruling two.");
    expect(playBatches([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });
});

describe("parseGenerated", () => {
  const good = { stem: "Is it legal?", choices: [{ id: "a", text: "Yes" }, { id: "b", text: "No" }, { id: "c", text: "Maybe" }, { id: "d", text: "Never" }], correctId: "b", explanation: "Because.", citation: "Rule 4-1", difficulty: "Advanced" };

  it("keeps well-formed questions and says why it dropped the rest", () => {
    const raw = `Here you go:\n${JSON.stringify([good, { ...good, correctId: "z" }, { ...good, stem: " " }, { ...good, choices: good.choices.slice(0, 1) }, { ...good, difficulty: "Hard" }])}`;
    const r = parseGenerated(raw, { citations: (c) => c.startsWith("Rule 4") });
    expect(r.questions).toHaveLength(2);
    expect(r.questions[1].difficulty).toBe("Intermediate");
    expect(r.rejected).toEqual(["correctId z isn't a choice", "no stem", "needs 2 to 5 choices"]);
  });

  it("drops a question whose citation isn't one it may cite", () => {
    const r = parseGenerated(JSON.stringify([{ ...good, citation: "Rule 9-1" }]), { citations: (c) => c.startsWith("Rule 4") });
    expect(r.questions).toEqual([]);
    expect(r.rejected).toEqual(["citation Rule 9-1 isn't in the context"]);
  });

  it("reports a reply that isn't a JSON array", () => {
    expect(parseGenerated("Sorry, I can't.", { citations: () => true })).toEqual({ questions: [], rejected: ["not a JSON array"] });
  });
});

describe("generatedTag", () => {
  it("names the section or rulings a question came from, within the tag limit", () => {
    expect(generatedTag("s:art4:s1")).toBe("gen:s:art4:s1");
    expect(generatedTag("x".repeat(200)).length).toBeLessThanOrEqual(100);
  });
});
