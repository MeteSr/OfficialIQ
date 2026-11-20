import { describe, expect, it } from "vitest";
import { checkCaseBook, checkRulesBook, parseCaseBook, parseRulesBook } from "./basketball.mjs";

// Invented text in the layout of the NCAA men's basketball books. The real
// books are only read at seed time; none of their text is in the repo.
let y = 50;
const L = (text, x = 36) => ({ x, y: (y += 11), words: text.split(" ") });
const page = (number, ...lines) => ({ number, width: 396, height: 612, lines });

describe("parseRulesBook", () => {
  const pages = [
    page(1,
      L("Men’s Basketball Rules"),
      L("Changes for 2030-31"),
      L("Each changed segment is shaded."),
      L("Widgets – (Rule 1-2.3) – Use of widgets on the"),
      L("court:"),
      L("a. Permit two widgets."),
      L("Gadgets (Division I Only) – (Rule 1-4.5)"),
      L("Gadgets are allowed."),
      L("Points of Emphasis"),
      L("The committee offers these directives for the season."),
      L("1. Spacing – Officials should watch the"),
      L("spacing.", 48),
      L("2. Clocks – Check the clock."),
      L("Significant Editorial"),
      L("Changes"),
      L("Note: ignored."),
    ),
    page(2,
      L("RULE 1"),
      L("Court and Things and"),
      L("Other Matters"),
      L("SECTION 1. THE GAME"),
      L("Art. 1. The game is played on a court by two"),
      L("teams. The ball is in-"),
      L("bounds when inbounds."),
      L("Art. 2. Lines are drawn:"),
      L("a. With paint; or", 48),
      L("b. With tape.", 48),
      L("7"),
      L("Note: Tape is rare."),
    ),
    page(3,
      L("[THIS PAGE IS INTENTIONALLY LEFT BLANK]"),
      L("RULE 2"),
      L("Officials"),
      L("SECTION 1. CREW"),
      L("Art. 1. There are three officials."),
      L("PENALTY: None."),
      L("Appendix I"),
      L("Not a rule."),
    ),
  ];
  const book = parseRulesBook(pages);

  it("splits the rules at their headings, with titles, ending before the appendixes", () => {
    expect(book.rules.map(r => [r.number, r.title])).toEqual([[1, "Court and Things and Other Matters"], [2, "Officials"]]);
    expect(book.rules[1].body).toBe("SECTION 1. CREW\nArt. 1. There are three officials.\nPENALTY: None.");
  });

  it("keeps paragraphs and settles line-end hyphens from the book", () => {
    expect(book.rules[0].body).toBe([
      "SECTION 1. THE GAME",
      "Art. 1. The game is played on a court by two teams. The ball is inbounds when inbounds.",
      "Art. 2. Lines are drawn:",
      "a. With paint; or",
      "b. With tape.",
      "Note: Tape is rare.",
    ].join("\n"));
  });

  it("drops figure labels and blank-page notices, and reports them", () => {
    expect(book.report.dropped.map(d => d.text)).toEqual(["7", "[THIS PAGE IS INTENTIONALLY LEFT BLANK]"]);
  });

  it("reads each of the season's changes with its rule citation", () => {
    expect(book.changes).toEqual([
      { title: "Widgets", citation: "Rule 1-2.3", text: "Widgets – (Rule 1-2.3) – Use of widgets on the court:\na. Permit two widgets." },
      { title: "Gadgets (Division I Only)", citation: "Rule 1-4.5", text: "Gadgets (Division I Only) – (Rule 1-4.5) Gadgets are allowed." },
    ]);
  });

  it("reads the points of emphasis, keeping each item's full text", () => {
    expect(book.emphasis).toEqual([
      { title: "Spacing", body: "Spacing – Officials should watch the spacing." },
      { title: "Clocks", body: "Clocks – Check the clock." },
    ]);
  });
});

describe("parseCaseBook", () => {
  const pages = [
    page(1, L("RULE 1—Court......4"), L("Contents")),
    page(2,
      L("RULE 1"),
      L("COURT AND THINGS"),
      L("The Ball"),
      L("A.R. 1–1. A ball is flat. Is it"),
      L("legal?"),
      L("RULING: No. The ball must be"),
      L("inflated."),
      L("(Rule 1-16.6)"),
      L("Benches"),
      L("A.R. 1–2. The bench is:"),
      L("1. Far away; or"),
      L("2. Close."),
      L("RULING: Either is fine."),
      L("(Rules 1-2 and 2-5.2)"),
    ),
    page(3,
      L("RULE 2"),
      L("OFFICIALS"),
      L("A.R. 2–1. A ball is:"),
      L("1. Red; or"),
      L("2. Blue."),
      L("RULING 1: Legal."),
      L("2: Illegal when the"),
      L("game is on."),
      L("(Rule 2-1)"),
      L("NOTE: Colors vary by"),
      L("league."),
      L("Timing"),
      L("A.R. 2–2. Two rulings."),
      L("RULING 1: First."),
      L("(Rule 2-2)"),
      L("2: Second."),
      L("(Rules 2-3 and"),
      L("2-4)"),
      L("A.R. 2–3. No citation here."),
      L("RULING: Still a ruling."),
      L("A.R. 2–4. Parts."),
      L("RULING 1: One."),
      L("(Rule 2-5)"),
      L("RULING 2 and 3: Two and three."),
      L("(Rule 2-6)"),
      L("If, after review, it was a fake,"),
      L("assess a foul."),
      L("(Rule 2-7)"),
      L("Fakes and"),
      L("Flops"),
      L("A.R. 2–5. Last."),
      L("RULING: Done."),
      L("(Rule 2-8)"),
      L("A.R. 2–6. Dashed."),
      L("RULING – Yes, it is. (Rules 2-9"),
      L("and 2-10)"),
      L("A.R. 2–7. Lower case."),
      L("Ruling: Fine."),
      L("(Rule 2-11)"),
      L("A.R. 2–8. Period."),
      L("RULING: After."),
      L("(Rules 2-12)."),
      L("A.R. 2–9. Unclosed."),
      L("RULING: Open."),
      L("(Rule 2-13."),
      L("A.R. 2–10. Next."),
      L("RULING 1: Fine."),
      L("RULING 2: As in Ruling 1."),
      L("(Rule 2-14)"),
      L("Index to Rules"),
      L("Term"),
    ),
  ];
  const book = parseCaseBook(pages);

  it("reads each approved ruling's play, ruling and citation, by rule", () => {
    expect(book.plays).toEqual([
      { ruleNumber: 1, citation: "A.R. 1–1 (Rule 1-16.6)", scenario: "A ball is flat. Is it legal?", ruling: "No. The ball must be inflated." },
      { ruleNumber: 1, citation: "A.R. 1–2 (Rules 1-2 and 2-5.2)", scenario: "The bench is:\n1. Far away; or\n2. Close.", ruling: "Either is fine." },
      {
        ruleNumber: 2, citation: "A.R. 2–1 (Rule 2-1)", scenario: "A ball is:\n1. Red; or\n2. Blue.",
        ruling: "1: Legal.\n2: Illegal when the game is on.\nNOTE: Colors vary by league.",
      },
      { ruleNumber: 2, citation: "A.R. 2–2 (Rule 2-2; Rules 2-3 and 2-4)", scenario: "Two rulings.", ruling: "1: First.\n2: Second." },
      { ruleNumber: 2, citation: "A.R. 2–3", scenario: "No citation here.", ruling: "Still a ruling." },
      {
        ruleNumber: 2, citation: "A.R. 2–4 (Rule 2-5; Rule 2-6; Rule 2-7)", scenario: "Parts.",
        ruling: "1: One.\n2 and 3: Two and three.\nIf, after review, it was a fake, assess a foul.",
      },
      { ruleNumber: 2, citation: "A.R. 2–5 (Rule 2-8)", scenario: "Last.", ruling: "Done." },
      { ruleNumber: 2, citation: "A.R. 2–6 (Rules 2-9 and 2-10)", scenario: "Dashed.", ruling: "Yes, it is." },
      { ruleNumber: 2, citation: "A.R. 2–7 (Rule 2-11)", scenario: "Lower case.", ruling: "Fine." },
      { ruleNumber: 2, citation: "A.R. 2–8 (Rules 2-12)", scenario: "Period.", ruling: "After." },
      { ruleNumber: 2, citation: "A.R. 2–9 (Rule 2-13.)", scenario: "Unclosed.", ruling: "Open." },
      { ruleNumber: 2, citation: "A.R. 2–10 (Rule 2-14)", scenario: "Next.", ruling: "1: Fine.\n2: As in Ruling 1." },
    ]);
  });

  it("reports topic headings it leaves out, notes it attaches, and rulings without a citation", () => {
    expect(book.report.headings).toEqual(["The Ball", "Benches", "Timing", "Fakes and", "Flops"]);
    expect(book.report.continued).toEqual(["A.R. 2–4"]);
    expect(book.report.notes).toEqual(["A.R. 2–1"]);
    expect(book.report.noCitation).toEqual(["A.R. 2–3"]);
  });
});

// The plain `pdftotext` extraction of the same invented pages: page breaks
// (form feeds), running headers glued to page numbers, hyphens dropped at
// line ends.
const raw = (...pages) => pages.map(p => p.join("\n")).join("\n\f");

describe("checkRulesBook", () => {
  const pages = [
    page(1, L("Changes for 2030-31"), L("Intro."), L("Widgets – (Rule 1-2) – Two"), L("widgets."),
      L("Points of Emphasis"), L("Intro."), L("1. Spacing – Watch it."), L("Significant Editorial")),
    page(2, L("RULE 1"), L("Court"), L("SECTION 1. GAME"), L("Art. 1. The ball is in-"), L("bounds.")),
    page(3, L("Art. 2. Lines.")),
    page(4, L("Appendix I")),
  ];
  const text = raw(
    ["Changes for 2030-31", "Intro.", "Widgets – (Rule 1-2) – Two", "widgets.", "Points of Emphasis", "Intro.", "1. Spacing – Watch it.", "Significant Editorial"],
    ["RULE 1", "Court", "SECTION 1. GAME", "Art. 1. The ball is in", "bounds.", "", "4"],
    ["RULE 1 / Court\b5", "", "Art. 2. Lines."],
    ["Appendix I"],
  );

  it("passes when every word matches the plain extraction", () => {
    expect(checkRulesBook(parseRulesBook(pages), text)).toEqual([]);
  });

  it("names the part that differs", () => {
    const book = parseRulesBook(pages);
    book.rules[0].body = book.rules[0].body.replace("Lines", "Line");
    book.emphasis[0].body = "Spacing – Watch.";
    expect(checkRulesBook(book, text)).toEqual(["rules", "points of emphasis"]);
  });
});

describe("checkCaseBook", () => {
  const pages = [
    page(1, L("RULE 1—Court......4")),
    page(2, L("RULE 1"), L("COURT"), L("The Ball"), L("A.R. 1–1. Flat?"), L("RULING 1: No."), L("(Rule 1-1)"),
      L("2: Yes. (Rule 1-2)"), L("A.R. 1–2. Bench."), L("RULING – Fine."), L("(Rule 1-3)."), L("NOTE: Ok, as in Ruling 1.")),
    page(3, L("Timing"), L("A.R. 1–3. Clock."), L("Ruling: Run."), L("(Rule 1-4"), L("Index to Rules"), L("Term")),
  ];
  const text = raw(
    ["RULE 1—Court......4"],
    ["RULE 1", "COURT", "The Ball", "A.R. 1–1. Flat?", "RULING 1: No.", "(Rule 1-1)", "2: Yes. (Rule 1-2)",
      "A.R. 1–2. Bench.", "RULING – Fine.", "(Rule 1-3).", "NOTE: Ok, as in Ruling 1.", "", "7"],
    ["RULE 1 / Court\b8", "", "Timing", "A.R. 1–3. Clock.", "Ruling: Run.", "(Rule 1-4", "Index to Rules", "Term"],
  );

  it("passes when every word matches the plain extraction", () => {
    expect(checkCaseBook(parseCaseBook(pages), text)).toEqual([]);
  });

  it("names the play that differs, or text it lost", () => {
    const book = parseCaseBook(pages);
    book.plays[1].ruling = "Fine.";
    book.plays[2].scenario = "Clocks.";
    expect(checkCaseBook(book, text)).toEqual(["A.R. 1–2", "A.R. 1–3"]);
  });
});
