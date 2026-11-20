import { describe, expect, it } from "vitest";
import { stripRunning } from "./text.mjs";
import { checkFootballBook, checkReplayCaseBook, FOOTBALL_LAYOUT, parseFootballBook, parseReplayCaseBook } from "./football.mjs";

// Invented text in the layout of the NCAA football rules book. The real
// book is only read at seed time; none of its text is in the repo.
let y = 50;
const L = (text, x = 36, gap = 10) => ({ x, y: (y += gap), words: text.split(" ") });
// A heading or a new block sits after a wider gap than a wrapped line.
const G = (text, x = 36) => L(text, x, 14);
const page = (number, ...lines) => { y = 50; return { number, width: 396, height: 612, lines }; };
// Two words at the same height that pdftotext gives as separate lines.
// pdftotext can give a page's blocks out of reading order: here "II." on
// its own comes before the line above it.
const outOfOrder = (above, [number, text]) => [number, above, text];
const pair = (left, right, lx = 36, rx = 63) => { y += 12; return [{ x: lx, y, words: left.split(" ") }, { x: rx, y, words: right.split(" ") }]; };

const pages = [
  page(1,
    G("Major Rules Changes"),
    L("for 2030"),
    G("Intro to the changes."),
    G("MAJOR RULES CHANGES FOR 2030", 102),
    ...pair("1-2-3-a", "Widgets are now legal.", 40, 101),
    ...pair("9-1-3 Penalty", "Penalty adjusted to remove the", 40, 101),
    L("carry-over.", 117),
    G("Index to Editorial Changes"),
    L("1-2-3 Creates widgets."),
  ),
  page(2,
    G("Points of Emphasis"),
    G("Intro to the points.", 44),
    G("PROTECTION OF PLAYERS /"),
    L("TARGETING"),
    G("The committees embrace", 44),
    L("safety."),
    G("Officials should act.", 44),
    G("SIDELINE CONTROL"),
    G("Coaches stay back.", 44),
    G("Statement on"),
    L("Sportsmanship"),
  ),
  page(3,
    G("Part I:"),
    G("RULE 1"),
    G("The Game, Field"),
    L("and Equipment"),
    G("SECTION 1. GENERAL PROVISIONS", 123),
    G("The Game"),
    G("ARTICLE 1."),
    L("a. The game is played by two"),
    L("teams (A.R. 7-1-4-"),
    L("IV).", 52),
    G("Goal Lines"),
    G("ARTICLE 2. Goal lines are set at the"),
    L("ends of the field."),
  ),
  page(4,
    L("b. They are white."),
    G("RULE 2"),
    G("Definitions"),
    G("SECTION 1. TERMS", 123),
    G("ARTICLE 1. A term is a term (see"),
    L("Appendix A)."),
    G("Appendix A"),
    L("Not a rule."),
  ),
  page(5,
    G("Part III:"),
    G("Interpretations"),
    G("RULE 1"),
    G("The Game, Field"),
    L("and Equipment"),
    G("SECTION 2. THE FIELD", 134),
    G("Dimensions and Markings—ARTICLE 1"),
    G("Approved Ruling 1-2-1"),
    G("I. A team paints the field red."),
    ...outOfOrder(L("RULING: Legal.", 63), pair("II.", "A team paints it blue. RULING:")),
    L("Illegal. It must be", 63),
    L("green.", 63),
    G("Balls and"),
    L("Other Things—ARTICLE 2"),
    G("Approved Ruling 1-3-2"),
    G("I. A ball is flat. RULING: Replace it."),
    G("II. A ball is wet. RULING: Dry it [if it"),
    L("is wet.]", 63),
    G("Fouls by a team after the"),
    L("snap:"),
    G("III. A ball is old. RULING: Keep it."),
    G("Note: Old balls are"),
    L("fine."),
    G("IV 1/10 @ A-25. A ball is new. RULING:"),
    L("Use it.", 63),
    G("VI Not next, so a heading."),
    G("Wet Balls—ARTICLE 3"),
    G("RULE 2"),
    G("Definitions"),
    G("SECTION 1. TERMS", 134),
    G("Approved Ruling 2-1-1"),
    G("I. Is a term a term? RULING: Yes."),
    G("II. Two parts:"),
    L("1. A term. RULING: Yes.", 63),
    L("2. A word. RULING: No.", 63),
    G("Index to Rules"),
    L("Term"),
  ),
];
const book = parseFootballBook(pages);

describe("parseFootballBook", () => {
  it("reads the season's major rule changes from their table", () => {
    expect(book.changes).toEqual([
      { citation: "Rule 1-2-3-a", text: "Widgets are now legal." },
      { citation: "Rule 9-1-3 Penalty", text: "Penalty adjusted to remove the carry-over." },
    ]);
  });

  it("reads the points of emphasis under their headings", () => {
    expect(book.emphasis).toEqual([
      { title: "PROTECTION OF PLAYERS /TARGETING", body: "The committees embrace safety.\nOfficials should act." },
      { title: "SIDELINE CONTROL", body: "Coaches stay back." },
    ]);
  });

  it("reads each rule with its title, keeping headings, articles and items as paragraphs", () => {
    expect(book.rules.map(r => [r.number, r.title])).toEqual([[1, "The Game, Field and Equipment"], [2, "Definitions"]]);
    expect(book.rules[0].body).toBe([
      "SECTION 1. GENERAL PROVISIONS",
      "The Game",
      "ARTICLE 1.",
      "a. The game is played by two teams (A.R. 7-1-4-IV).",
      "Goal Lines",
      "ARTICLE 2. Goal lines are set at the ends of the field.",
      "b. They are white.",
    ].join("\n"));
    expect(book.rules[1].body).toBe("SECTION 1. TERMS\nARTICLE 1. A term is a term (see Appendix A).");
  });

  it("reads each approved ruling as a play, splitting the ruling from the facts", () => {
    expect(book.plays).toEqual([
      { ruleNumber: 1, citation: "A.R. 1-2-1-I", scenario: "A team paints the field red.", ruling: "Legal." },
      { ruleNumber: 1, citation: "A.R. 1-2-1-II", scenario: "A team paints it blue.", ruling: "Illegal. It must be green." },
      { ruleNumber: 1, citation: "A.R. 1-3-2-I", scenario: "A ball is flat.", ruling: "Replace it." },
      { ruleNumber: 1, citation: "A.R. 1-3-2-II", scenario: "A ball is wet.", ruling: "Dry it [if it is wet.]" },
      { ruleNumber: 1, citation: "A.R. 1-3-2-III", scenario: "Fouls by a team after the snap:\nA ball is old.", ruling: "Keep it.\nNote: Old balls are fine.", lead: "Fouls by a team after the snap:" },
      { ruleNumber: 1, citation: "A.R. 1-3-2-IV", scenario: "Fouls by a team after the snap:\n1/10 @ A-25. A ball is new.", ruling: "Use it.", lead: "Fouls by a team after the snap:" },
      { ruleNumber: 2, citation: "A.R. 2-1-1-I", scenario: "Is a term a term?", ruling: "Yes." },
      { ruleNumber: 2, citation: "A.R. 2-1-1-II", scenario: "Two parts:\n1. A term.", ruling: "Yes.\n2. A word. RULING: No." },
    ]);
    expect(book.report.headings).toEqual(expect.arrayContaining(["Balls and Other Things—ARTICLE 2", "VI Not next, so a heading."]));
    expect(book.report.headings).not.toContain("Fouls by a team after the snap:");
    expect(book.report.leads).toEqual(["Fouls by a team after the snap:"]);
    expect(book.report.notes).toEqual(["A.R. 1-3-2-III"]);
  });
});

// `pdftotext -layout` of the same invented pages: text placed by position
// (so in reading order, the running header on a page's first line), page
// breaks as form feeds, hyphens dropped at line ends.
const raw = (...ps) => ps.map(p => p.join("\n")).join("\n\f");
const text = raw(
  ["Major Rules Changes", "for 2030", "Intro to the changes.", "MAJOR RULES CHANGES FOR 2030", "1-2-3-a", "Widgets are now legal.",
    "9-1-3 Penalty", "Penalty adjusted to remove the", "carryover.", "Index to Editorial Changes", "1-2-3 Creates widgets.", "", "FR-6"],
  ["Points of EmphasisFR-7", "", "Points of Emphasis", "Intro to the points.", "PROTECTION OF PLAYERS /", "TARGETING", "The committees embrace",
    "safety.", "Officials should act.", "SIDELINE CONTROL", "Coaches stay back.", "Statement on", "Sportsmanship"],
  ["Part I:", "RULE 1", "The Game, Field", "and Equipment", "SECTION 1. GENERAL PROVISIONS", "The Game", "ARTICLE 1.",
    "a. The game is played by two", "teams (A.R. 7-1-4-", "IV).", "Goal Lines", "ARTICLE 2. Goal lines are set at the", "ends of the field.", "", "FR-17"],
  ["FR-18\b                RULE 1 / The Game, Fieldand Equipment", "", "   b. They are white.", "RULE 2", "Definitions", "SECTION 1. TERMS",
    "ARTICLE 1. A term is a term (see", "Appendix A).", "Appendix A", "Not a rule."],
  ["Part III:", "Interpretations", "RULE 1", "The Game, Field", "and Equipment", "SECTION 2. THE FIELD", "Dimensions and Markings—ARTICLE 1",
    "Approved Ruling 1-2-1", "I. A team paints the field red.", "RULING: Legal.", "II.", "A team paints it blue. RULING:", "Illegal. It must be",
    "green.", "Balls and", "Other Things—ARTICLE 2", "Approved Ruling 1-3-2", "I. A ball is flat. RULING: Replace it.", "II. A ball is wet. RULING: Dry it [if it", "is wet.]", "Fouls by a team after the", "snap:", "III. A ball is old. RULING: Keep it.", "Note: Old balls are", "fine.", "IV     1/10 @ A-25. A ball is new. RULING:", "Use it.", "VI Not next, so a heading.", "Wet Balls—ARTICLE 3", "RULE 2", "Definitions",
    "SECTION 1. TERMS", "Approved Ruling 2-1-1", "I. Is a term a term? RULING: Yes.", "II. Two parts:", "1. A term. RULING: Yes.", "2. A word. RULING: No.", "Index to Rules", "Term"],
);

describe("checkFootballBook", () => {
  it("passes when every word matches the plain extraction", () => {
    expect(checkFootballBook(book, text)).toEqual([]);
  });

  it("names each part that differs", () => {
    const changed = structuredClone(book);
    changed.rules[1].body = changed.rules[1].body.replace("term is", "term was");
    changed.changes[0].text = "Widgets are legal.";
    changed.emphasis[1].body = "Coaches stay.";
    changed.plays[1].ruling = "Illegal.";
    expect(checkFootballBook(changed, text)).toEqual(["rules", "rule changes", "points of emphasis", "A.R. 1-2-1-II"]);
  });
});

describe("FOOTBALL_LAYOUT", () => {
  it("drops running headers and page numbers but keeps a heading set in the header band", () => {
    const at = (y, text) => ({ x: 54, y, words: text.split(" ") });
    const kept = stripRunning([{ number: 1, lines: [
      at(39.8, "RULE 1 / The Game, Fieldand EquipmentFR-19"), at(39.8, "FR-18"), at(39.8, "Points of Emphasis"),
      at(39.8, "Part III: / KicksFI-36"), at(39.8, "Index to Rules"), at(61, "Body."), at(567.9, "FI-4"),
    ] }], FOOTBALL_LAYOUT);
    expect(kept[0].lines.map(l => l.words.join(" "))).toEqual(["Index to Rules", "Body."]);
  });
});

describe("parseReplayCaseBook", () => {
  // The Instant Replay Case Book's play situations: everything at the
  // margin, numbered plays in sequence under topic headings.
  const replay = [
    page(1, L("Contents"), L("PART III: 2030 PLAY SITUATIONS")),
    page(2,
      G("PART III: 2030 PLAY"),
      G("SITUATIONS"),
      G("Free Kicks"),
      G("Note: In each play the kick is at the A-35."),
      G("1. Touching a kick"),
      G("A80 touches the ball. Is it"),
      L("reviewable? RULING: Yes. Overturn (Rule 12-3)."),
      G("2. Another kick"),
      G("The kick goes out of bounds."),
      G("RULING: Reviewable. B ball:"),
      L("1. at the B-35; or"),
      L("2. a rekick."),
      G("NON-REVIEWABLE KICKS"),
      G("3. Late flag"),
      G("A flag comes in late. RULING: Not"),
      L("reviewable."),
      G("Note: Flags are never reviewed."),
      G("Runs"),
      G("4. Runner down"),
      G("A22 is down. RULING: Reviewable."),
      G("5. Contact to the head or neck of a"),
      L("defenseless player"),
      G("B12 hits A80. RULING: Foul."),
    ),
  ];
  const r = parseReplayCaseBook(replay);

  it("reads each numbered play, with the lead-in that applies to its group", () => {
    expect(r.plays).toEqual([
      { ruleNumber: 12, citation: "Instant Replay Case Book 1 (Touching a kick)", scenario: "Note: In each play the kick is at the A-35.\nA80 touches the ball. Is it reviewable?", ruling: "Yes. Overturn (Rule 12-3).", lead: "Note: In each play the kick is at the A-35." },
      { ruleNumber: 12, citation: "Instant Replay Case Book 2 (Another kick)", scenario: "Note: In each play the kick is at the A-35.\nThe kick goes out of bounds.", ruling: "Reviewable. B ball: 1. at the B-35; or 2. a rekick.", lead: "Note: In each play the kick is at the A-35." },
      { ruleNumber: 12, citation: "Instant Replay Case Book 3 (Late flag)", scenario: "A flag comes in late.", ruling: "Not reviewable.\nNote: Flags are never reviewed.", lead: "" },
      { ruleNumber: 12, citation: "Instant Replay Case Book 4 (Runner down)", scenario: "A22 is down.", ruling: "Reviewable.", lead: "" },
      { ruleNumber: 12, citation: "Instant Replay Case Book 5 (Contact to the head or neck of a defenseless player)", scenario: "B12 hits A80.", ruling: "Foul.", lead: "" },
    ]);
    expect(r.report.headings).toEqual(["Free Kicks", "NON-REVIEWABLE KICKS", "Runs"]);
  });

  it("passes the word-for-word check, and names a play that differs", () => {
    const text = raw(
      ["Contents", "PART III: 2030 PLAY SITUATIONS", "", "1"],
      ["PART III: 2030 PLAY", "SITUATIONS", "Free Kicks", "Note: In each play the kick is at the A-35.", "1. Touching a kick",
        "A80 touches the ball. Is it", "reviewable? RULING: Yes. Overturn (Rule 12-3).", "2. Another kick", "The kick goes out of bounds.",
        "RULING: Reviewable. B ball:", "1. at the B-35; or", "2. a rekick.", "NON-REVIEWABLE KICKS", "3. Late flag",
        "A flag comes in late. RULING: Not", "reviewable.", "Note: Flags are never reviewed.", "Runs", "4. Runner down",
        "A22 is down. RULING: Reviewable.", "5. Contact to the head or neck of a", "defenseless player", "B12 hits A80. RULING: Foul.", "", "36"],
    );
    expect(checkReplayCaseBook(r, text)).toEqual([]);
    const changed = structuredClone(r);
    changed.plays[2].ruling = "Not reviewable.";
    changed.plays[0].scenario = changed.plays[0].scenario.replace("Is it", "Was it");
    expect(checkReplayCaseBook(changed, text)).toEqual(["Instant Replay Case Book 1 (Touching a kick)", "Instant Replay Case Book 3 (Late flag)"]);
  });
});
