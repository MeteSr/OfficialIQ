import { describe, expect, it } from "vitest";
import { buildVocabulary, joinLines, normalizeForCheck, parseBbox, sameWords, stripRunning } from "./text.mjs";

// Invented fixtures in the shape of pdftotext -bbox-layout output. No NCAA
// text is kept in the repository (it is imported at seed time).
const line = (y, words) =>
  `<line xMin="36" yMin="${y}" xMax="300" yMax="${y + 9}">${words.map(w => `<word xMin="0" yMin="0" xMax="0" yMax="0">${w}</word>`).join("")}</line>`;
const page = (...lines) => `<page width="396" height="612"><flow><block>${lines.join("")}</block></flow></page>`;
const doc = (...pages) => `<html><body><doc>${pages.join("")}</doc></body></html>`;

describe("parseBbox", () => {
  it("reads pages, lines and words, decoding entities", () => {
    const pages = parseBbox(doc(page(line(100, ["Fish", "&amp;", "chips"]), line(110, ["&quot;Yes&quot;", "&lt;2&gt;"]))));
    expect(pages).toHaveLength(1);
    expect(pages[0].height).toBe(612);
    expect(pages[0].lines.map(l => l.words)).toEqual([["Fish", "&", "chips"], ['"Yes"', "<2>"]]);
    expect(pages[0].lines[0].y).toBe(100);
  });

  it("treats tabs as spacing and drops control characters", () => {
    const pages = parseBbox(doc(page(line(100, ["a.\t", "The", "20\b"]))));
    expect(pages[0].lines[0].words).toEqual(["a.", "The", "20"]);
  });
});

describe("stripRunning", () => {
  it("drops running headers and page numbers by pattern and position, keeping a heading in the same band", () => {
    const pages = parseBbox(doc(
      page(line(49, ["PART", "1"]), line(100, ["Body", "text"]), line(568, ["18"])),
      page(line(40, ["PART", "1", "/", "Things", "19"]), line(100, ["More"]), line(568, ["19"])),
    ));
    const kept = stripRunning(pages, {
      header: /^PART \d+ \/ .+ \d+$|^\d+ PART \d+ \/ .+$/,
      headerMaxY: 55,
      footerMinY: 560,
    });
    expect(kept.flatMap(p => p.lines.map(l => l.words.join(" ")))).toEqual(["PART 1", "Body text", "More"]);
  });
});

describe("joinLines", () => {
  const vocab = buildVocabulary([
    ["the", "ball", "is", "inbounds", "and", "a", "well-known", "case"],
    ["out-of-bounds", "now", "gameplay"],
  ]);

  it("joins lines with a space and starts a paragraph at a marker", () => {
    const { paragraphs } = joinLines([["Art.", "1.", "The", "ball"], ["is", "live."], ["Art.", "2.", "It", "ends."]], vocab, { paragraphStart: /^Art\. \d+\./ });
    expect(paragraphs).toEqual(["Art. 1. The ball is live.", "Art. 2. It ends."]);
  });

  it("keeps a hyphen inside a compound broken at its hyphen", () => {
    const { paragraphs, unresolved } = joinLines([["went", "out-of-"], ["bounds", "now"]], vocab);
    expect(paragraphs).toEqual(["went out-of-bounds now"]);
    expect(unresolved).toEqual([]);
  });

  it("joins a word the book spells unhyphenated elsewhere", () => {
    expect(joinLines([["the", "ball", "is", "in-"], ["bounds", "today"]], vocab).paragraphs).toEqual(["the ball is inbounds today"]);
    expect(joinLines([["fair", "game-"], ["play"]], vocab).paragraphs).toEqual(["fair gameplay"]);
  });

  it("keeps the hyphen when the book spells the hyphenated form elsewhere", () => {
    expect(joinLines([["a", "well-"], ["known", "case"]], vocab).paragraphs).toEqual(["a well-known case"]);
  });

  it("keeps a hyphen after a digit or before a capital or digit", () => {
    expect(joinLines([["a", "12-"], ["inch", "line"]], vocab).paragraphs).toEqual(["a 12-inch line"]);
    expect(joinLines([["a", "non-"], ["NCAA", "game"]], vocab).paragraphs).toEqual(["a non-NCAA game"]);
  });

  it("reports a break the book can't settle, keeping the hyphen, unless an override decides it", () => {
    const r = joinLines([["the", "blorf-"], ["wizzle", "rule"]], vocab, { where: "p. 9" });
    expect(r.paragraphs).toEqual(["the blorf-wizzle rule"]);
    expect(r.unresolved).toEqual([{ left: "blorf-", right: "wizzle", where: "p. 9" }]);
    const merged = joinLines([["the", "blorf-"], ["wizzle", "rule"]], vocab, { overrides: { "blorf-|wizzle": "join" } });
    expect(merged.paragraphs).toEqual(["the blorfwizzle rule"]);
    expect(merged.unresolved).toEqual([]);
  });

  it("joins straight after an em dash or a slash at a line end", () => {
    expect(joinLines([["THE", "COURT—"], ["SIZE"]], vocab).paragraphs).toEqual(["THE COURT—SIZE"]);
    expect(joinLines([["and/"], ["or"]], vocab).paragraphs).toEqual(["and/or"]);
  });
});

describe("the word-for-word check", () => {
  it("ignores whitespace and hyphenation only", () => {
    expect(normalizeForCheck("out-of-\nbounds  ball")).toBe(normalizeForCheck("out-ofbounds ball"));
    expect(sameWords("A ball is live.", "A ball\nis live.")).toBe(true);
  });
  it("catches a changed, dropped or extra word", () => {
    expect(sameWords("A ball is live.", "A ball was live.")).toBe(false);
    expect(sameWords("A ball is live.", "A ball live.")).toBe(false);
    expect(sameWords("A ball is live.", "A ball is now live.")).toBe(false);
  });
});
