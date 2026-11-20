// Reads the NCAA football rules book (2026 layout) into the app's content:
// one article per rule (Part I), one casebook play per approved ruling
// (Part III), the season's major rule changes and the points of emphasis.
// Every passage keeps the book's wording; see text.mjs for how lines are
// rejoined, and checkFootballBook for the word-for-word check.
import { buildVocabulary, groupAt, joinMarked, normalizeForCheck } from "./text.mjs";

/**
 * Where the running headers and page numbers sit (396 x 612pt pages):
 * "FR-18", "RULE 1 / …", "Points of EmphasisFR-9", "Part III: / …FI-5" at
 * the top, "FR-17" or "FI-4" at the foot. A heading can share the band
 * ("Index to Rules"), so headers are matched by what they say.
 */
export const FOOTBALL_LAYOUT = {
  header: /F[RIO]-\d+$|^(RULE \d+|Part I+:|APPENDIX [A-Z]) \/ |^(Points of Emphasis|The Football Code)$/,
  headerMaxY: 45,
  footer: /^F[RIO]-\d+$/,
  footerMinY: 560,
};

// A line that starts a paragraph in the rules: sections, articles, list
// items, notes, penalties and exceptions. A wider gap than a wrapped line
// also starts one (the topic headings over articles).
const RULE_PARAGRAPH = /^(SECTION \d+\.|ARTICLE \d+\.|([a-z]|[ivx]{1,4})\.(\s|$)|\d+\.(\s|$)|\([a-z0-9]+\)(\s|$)|Note\b|NOTE\b|PENALTY\b|Exceptions?\b|•)/;
const GAP = 12;
const CAPS = /^(?=.*\p{Lu}.*\p{Lu})[\p{Lu}\p{N}\s&/,'’.\-–—:()]+$/u;
const ROMAN = /^([IVXL]+)(\.?)(\s|$)/;
const ROMAN_VALUE = { I: 1, V: 5, X: 10, L: 50 };
const romanValue = (r) => [...r].reduce((sum, c, k) => {
  const v = ROMAN_VALUE[c];
  return sum + (v < (ROMAN_VALUE[r[k + 1]] ?? 0) ? -v : v);
}, 0);
// A numbered part of a play ("1. Team A fouls …").
const PLAY_PARAGRAPH = /^(\d+\.\s|NOTE\b|Note:)/;

/**
 * Lines in reading order, with words pdftotext gives as separate lines at
 * the same height (a table row, "I." beside its text) put back together,
 * in reading order, and `start` marking a line after a wider gap.
 */
function flatten(pages) {
  const out = [];
  for (const p of pages) {
    const rows = [];
    for (const l of p.lines) {
      const row = rows.find((r) => Math.abs(r.y - l.y) < 1);
      if (row) row.parts.push(l);
      else rows.push({ y: l.y, parts: [l] });
    }
    // One column: reading order is top to bottom, whatever order the
    // blocks came in.
    rows.sort((a, b) => a.y - b.y);
    const margin = Math.min(...p.lines.map((l) => l.x));
    let prevY = null;
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x);
      const words = r.parts.flatMap((l) => l.words);
      out.push({
        page: p.number, x: r.parts[0].x, margin, words, text: words.join(" "),
        start: prevY !== null && r.y - prevY > GAP,
      });
      prevY = r.y;
    }
  }
  return out;
}

export function parseFootballBook(pages, { overrides = {} } = {}) {
  const lines = flatten(pages);
  const vocab = buildVocabulary(lines.map((l) => l.words));
  const report = { unresolved: [], headings: [], skipped: [] };
  const at = (re, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i].text)) return i; return -1; };
  const join = (ls, where, paragraphStart) => {
    const r = joinMarked(ls.map((l) => ({ ...l, start: l.start || (paragraphStart ? paragraphStart.test(l.text) : false) })), vocab, { overrides, where });
    report.unresolved.push(...r.unresolved);
    return r.paragraphs;
  };

  // The major rule changes: a table of citation and summary.
  const changes = [];
  const changesStart = at(/^MAJOR RULES CHANGES FOR \d{4}$/);
  const changesEnd = at(/^Index to Editorial Changes$/, Math.max(changesStart, 0));
  if (changesStart >= 0 && changesEnd > changesStart) {
    const ROW = /^(\d+(-[0-9A-Za-z]+)+( Penalty)?) (.+)$/;
    for (const g of groupAt(lines.slice(changesStart + 1, changesEnd), (l) => ROW.test(l.text))) {
      const m = g[0].text.match(ROW);
      const first = { ...g[0], words: m[4].split(" "), start: false };
      const rest = g.slice(1).map((l) => ({ ...l, start: false }));
      changes.push({ citation: `Rule ${m[1]}`, text: join([first, ...rest], `change ${m[1]}`).join(" ") });
    }
  }

  // The points of emphasis: an all-capitals heading over each, paragraphs
  // indented. The introduction before the first heading isn't one.
  const emphasis = [];
  const emphasisStart = at(/^Points of Emphasis$/, Math.max(changesEnd, 0));
  const emphasisEnd = at(/^Statement on$/, Math.max(emphasisStart, 0));
  if (emphasisStart >= 0 && emphasisEnd > emphasisStart) {
    const body = lines.slice(emphasisStart + 1, emphasisEnd);
    const items = [];
    for (const [k, l] of body.entries()) {
      if (CAPS.test(l.text)) {
        if (k > 0 && CAPS.test(body[k - 1].text) && items.length) items.at(-1).title.push(l);
        else items.push({ title: [l], body: [] });
      } else if (items.length) items.at(-1).body.push({ ...l, start: Math.abs(l.x - l.margin - 8) <= 2 });
      else report.skipped.push(l.text);
    }
    for (const it of items) {
      const title = join(it.title.map((l) => ({ ...l, start: false })), "emphasis title").join(" ");
      emphasis.push({ title, body: join(it.body, `emphasis: ${title}`).join("\n") });
    }
  }

  // Part I, the rules: "RULE n", its title, then sections, up to the
  // appendixes.
  const rules = [];
  const partOne = at(/^Part I:$/, Math.max(emphasisEnd, 0));
  const appendix = at(/^Appendix A$/, Math.max(partOne, 0));
  let i = Math.max(partOne, 0);
  for (let n = 1; ; n++) {
    const start = at(new RegExp(`^RULE ${n}$`), i);
    if (start < 0 || (appendix >= 0 && start > appendix)) break;
    const next = at(new RegExp(`^RULE ${n + 1}$`), start + 1);
    const stop = next >= 0 && (appendix < 0 || next < appendix) ? next : appendix >= 0 ? appendix : lines.length;
    let t = start + 1;
    const titleLines = [];
    while (t < stop && !/^SECTION \d+\./.test(lines[t].text)) titleLines.push({ ...lines[t++], start: false });
    const title = join(titleLines, `Rule ${n} title`).join(" ");
    const body = lines.slice(t, stop).map((l, k) => (k === 0 ? { ...l, start: false } : l));
    rules.push({ number: n, title, body: join(body, `Rule ${n}`, RULE_PARAGRAPH).join("\n") });
    i = stop;
  }

  // Part III, the approved rulings: "Approved Ruling 1-2-1" over plays
  // "I.", "II." …, each the facts then "RULING:" and the decision.
  const outline = [];
  const rulings = [];
  const partThree = lines.findLastIndex((l, k) => l.text === "Part III:" && lines[k + 1]?.text === "Interpretations");
  const index = at(/^Index to Rules$/, Math.max(partThree, 0));
  let rule = null;
  let base = null;
  let cur = null;
  let title = false;
  let heading = false; // the last line was a heading at the margin
  let number = 0; // the last play's numeral in this group
  const skip = (l) => { outline.push({ text: l.text }); };
  const close = () => { cur = null; };
  if (partThree >= 0) {
    // From the first rule's heading, past the list of new rulings.
    const first = at(/^RULE 1$/, partThree);
    for (const l of lines.slice(first, index < 0 ? lines.length : index)) {
      const r = l.text.match(/^RULE (\d+)$/);
      if (r) { close(); rule = Number(r[1]); title = true; skip(l); continue; }
      if (title) {
        if (!/^SECTION \d+\./.test(l.text)) { skip(l); continue; }
        title = false;
      }
      const ar = l.text.match(/^Approved Ruling (\d+-\d+-\d+)$/);
      if (ar) { close(); base = ar[1]; number = 0; skip(l); continue; }
      if (/^SECTION \d+\./.test(l.text)) { close(); skip(l); report.headings.push(l.text); continue; }
      // "I.", "II." …; a few are printed without the period, so a bare
      // numeral counts only as the next one in its group.
      const rn = l.text.match(ROMAN);
      const n = rn ? romanValue(rn[1]) : 0;
      if (rn && base && (rn[2] === "." || n === number + 1)) {
        heading = false;
        number = n;
        const mark = `${rn[1]}${rn[2]}`;
        cur = { ruleNumber: rule, id: `${base}-${rn[1]}`, lines: [{ ...l, words: l.words.slice(1), text: l.text.replace(ROMAN, ""), start: false }] };
        rulings.push(cur);
        outline.push({ play: rulings.length - 1, mark });
        continue;
      }
      // Play text is indented; a line at the margin is a heading over the
      // next rulings ("Goal Lines—ARTICLE 2", "Fouls after a touchdown by
      // Team A:"), however many lines it takes.
      if (cur && Math.abs(l.x - l.margin) > 4) { cur.lines.push(l); continue; }
      const continues = !cur && heading && !l.start;
      close();
      skip(l);
      if (continues) report.headings[report.headings.length - 1] += ` ${l.text}`;
      else report.headings.push(l.text);
      heading = true;
      continue;
    }
  }
  const plays = rulings.map((r) => {
    // The facts, then "RULING:" (on a line of its own words or mid-line).
    const k = r.lines.findIndex((l) => l.words.includes("RULING:"));
    let facts = r.lines;
    let decision = [];
    if (k >= 0) {
      const w = r.lines[k].words;
      const at = w.indexOf("RULING:");
      facts = [...r.lines.slice(0, k), ...(at > 0 ? [{ ...r.lines[k], words: w.slice(0, at) }] : [])];
      const after = w.slice(at + 1);
      decision = [...(after.length ? [{ ...r.lines[k], words: after, start: false }] : []), ...r.lines.slice(k + 1)];
      if (decision.length) decision[0] = { ...decision[0], start: false };
    } else report.headings.push(`no RULING: A.R. ${r.id}`);
    return {
      ruleNumber: r.ruleNumber,
      citation: `A.R. ${r.id}`,
      scenario: join(facts, `A.R. ${r.id}`, PLAY_PARAGRAPH).join("\n"),
      ruling: join(decision, `A.R. ${r.id}`, PLAY_PARAGRAPH).join("\n"),
    };
  });
  return { rules, changes, emphasis, plays, report, outline };
}

// The word-for-word check, as for basketball (see checkRulesBook there),
// against `pdftotext -layout` of the same PDF. Its plain mode can give a
// page's blocks out of reading order in this book; layout mode places text
// by position, so it reads top to bottom with each page's running header
// on its first line ("FR-18   RULE 1 / …", "Points of EmphasisFR-9") and
// the page number, if it is at the foot, on its last.
const PAGE_NUMBER = /^F[RIO]-\d+$/;
const RUNNING = /F[RIO]-\d+|^(RULE \d+|Part I+:|APPENDIX [A-Z])\s\/\s/;
export function plain(text) {
  const kept = [];
  for (const page of text.replace(/[\x00-\x08\x0b\x0e-\x1f\x7f]/g, " ").split("\f")) {
    const ls = page.split("\n").map((l) => l.trim()).filter((l) => l !== "");
    if (ls.length && RUNNING.test(ls[0])) ls.shift();
    if (ls.length && PAGE_NUMBER.test(ls.at(-1))) ls.pop();
    kept.push(...ls);
  }
  return normalizeForCheck(kept.join("\n"));
}

export function checkFootballBook(book, rawText) {
  const raw = plain(rawText);
  const failed = [];
  const rules = normalizeForCheck(book.rules.map((r) => `RULE ${r.number}\n${r.title}\n${r.body}`).join("\n"));
  const start = raw.indexOf(rules.slice(0, 200));
  if (start < 0 || !raw.startsWith(`${rules}AppendixA`, start)) failed.push("rules");
  const changes = book.changes.map((c) => normalizeForCheck(c.citation.replace(/^Rule /, "") + c.text)).join("");
  if (!raw.includes(`${changes}IndextoEditorialChanges`)) failed.push("rule changes");
  const emphasis = book.emphasis.map((e) => normalizeForCheck(e.title + e.body)).join("");
  if (!raw.includes(`${emphasis}Statementon`)) failed.push("points of emphasis");

  const { outline, plays } = book;
  const anchor = (o) => ("play" in o ? o.mark : normalizeForCheck(o.text));
  let pos = raw.lastIndexOf("PartIII:Interpretations");
  if (pos < 0 || outline.length === 0) return [...failed, "approved rulings"];
  pos = raw.indexOf(anchor(outline[0]), pos);
  outline.forEach((o, k) => {
    const a = anchor(o);
    if (!raw.startsWith(a, pos)) {
      failed.push("play" in o ? plays[o.play].citation : `before “${o.text}”`);
      const found = raw.indexOf(a, pos);
      if (found < 0) return;
      pos = found;
    }
    pos += a.length;
    if (!("play" in o)) return;
    const next = k + 1 < outline.length ? anchor(outline[k + 1]) : "IndextoRules";
    const end = raw.indexOf(next, pos);
    const seg = raw.slice(pos, end < 0 ? undefined : end).replace("RULING:", "");
    const p = plays[o.play];
    if (seg !== normalizeForCheck(p.scenario + p.ruling) && !failed.includes(p.citation)) failed.push(p.citation);
    pos = end < 0 ? raw.length : end;
  });
  return failed;
}
