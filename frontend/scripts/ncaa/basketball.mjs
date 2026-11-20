// Reads the NCAA men's basketball rules book and case book (2026-27
// layout) into the app's content: one article per rule, one casebook play
// per approved ruling, the season's rule changes and points of emphasis.
// Every passage keeps the book's wording; see text.mjs for how lines are
// rejoined and import.mjs for the word-for-word check.
import { buildVocabulary, groupAt, joinMarked, normalizeForCheck } from "./text.mjs";

/** Where the running headers and page numbers sit in these books (612pt pages). */
export const BASKETBALL_LAYOUT = { header: /^(\d+|RULE \d+ \/ .+)$/, headerMaxY: 45, footerMinY: 567 };

// A line that starts a paragraph in the rules: sections, articles, list
// items (a., i., 1., (a), •), notes and penalties.
const RULE_PARAGRAPH = /^(SECTION \d+\.|Art\. \d+\.|([a-z]|[ivx]{1,4})\.(\s|$)|\d+\.(\s|$)|\([a-z0-9]+\)(\s|$)|Note\b|PENALTY\b|Exception\b|•)/;
const CASE_PARAGRAPH = /^(([a-z]|[ivx]{1,4})\.(\s|$)|\d+\.(\s|$)|\d+((,| and| or) \d+)*:\s|(NOTE|Note):|•)/;
// Not rule text: a page left blank, or a lone number labelling a figure.
const NOT_TEXT = /^(\[THIS PAGE IS INTENTIONALLY LEFT BLANK\]|\d{1,2})$/;

const flatten = (pages) => pages.flatMap((p) => p.lines.map((l) => ({ page: p.number, words: l.words, text: l.words.join(" ") })));
const join = joinMarked;

export function parseRulesBook(pages, { overrides = {} } = {}) {
  const lines = flatten(pages);
  const vocab = buildVocabulary(lines.map((l) => l.words));
  const report = { unresolved: [], dropped: [] };
  const at = (re, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i].text)) return i; return -1; };

  // The season's changes and points of emphasis, in the front matter.
  const changesStart = at(/^Changes for \d{4}-\d{2}$/);
  const emphasisStart = at(/^Points of Emphasis$/, Math.max(changesStart, 0));
  const editorialStart = at(/^Significant Editorial$/, Math.max(emphasisStart, 0));

  const changes = [];
  if (changesStart >= 0 && emphasisStart > changesStart) {
    const ITEM = /^(.+?) – \((Rules? [^)]+)\)/;
    for (const group of groupAt(lines.slice(changesStart + 1, emphasisStart), (l) => ITEM.test(l.text))) {
      const m = group[0].text.match(ITEM);
      const r = join(group, vocab, { paragraphStart: RULE_PARAGRAPH, overrides, where: `change: ${m[1]}` });
      report.unresolved.push(...r.unresolved);
      changes.push({ title: m[1], citation: m[2], text: r.paragraphs.join("\n") });
    }
  }

  const emphasis = [];
  if (emphasisStart >= 0 && editorialStart > emphasisStart) {
    const ITEM = /^\d+\.\s+(.+?) – /;
    for (const group of groupAt(lines.slice(emphasisStart + 1, editorialStart), (l) => ITEM.test(l.text))) {
      const title = group[0].text.match(ITEM)[1];
      const first = { ...group[0], words: group[0].words.slice(1) }; // the list number, not wording
      const r = join([first, ...group.slice(1)], vocab, { overrides, where: `emphasis: ${title}` });
      report.unresolved.push(...r.unresolved);
      emphasis.push({ title, body: r.paragraphs.join("\n") });
    }
  }

  // The rules themselves: "RULE n" headings, each followed by its title,
  // up to the appendixes.
  const rules = [];
  const end = at(/^Appendix I$/, Math.max(editorialStart, 0));
  let i = Math.max(editorialStart, 0);
  for (let n = 1; ; n++) {
    const start = at(new RegExp(`^RULE ${n}$`), i);
    if (start < 0 || (end >= 0 && start > end)) break;
    const next = at(new RegExp(`^RULE ${n + 1}$`), start + 1);
    const stop = next >= 0 && (end < 0 || next < end) ? next : end >= 0 ? end : lines.length;
    // The title runs from under the heading to the first section.
    let t = start + 1;
    const titleLines = [];
    while (t < stop && !/^SECTION \d+\./.test(lines[t].text)) titleLines.push(lines[t++]);
    const title = join(titleLines, vocab, { overrides, where: `Rule ${n} title` }).paragraphs.join(" ");
    const body = [];
    for (const l of lines.slice(t, stop)) {
      if (NOT_TEXT.test(l.text)) report.dropped.push({ page: l.page, text: l.text });
      else body.push(l);
    }
    const r = join(body, vocab, { paragraphStart: RULE_PARAGRAPH, overrides, where: `Rule ${n}` });
    report.unresolved.push(...r.unresolved);
    rules.push({ number: n, title, body: r.paragraphs.join("\n") });
    i = stop;
  }
  return { rules, changes, emphasis, report };
}

export function parseCaseBook(pages, { overrides = {} } = {}) {
  const lines = flatten(pages);
  const vocab = buildVocabulary(lines.map((l) => l.words));
  const report = { unresolved: [], headings: [], noCitation: [], notes: [], continued: [], unclosed: [] };
  const AR = /^A\.R\. (\d+)[–-](\d+)\.\s*/;
  // "RULING:" (or "RULING –", "Ruling:") or "RULING 1:", then "2:", "3:" …
  // for the parts of a play. The word "RULING" is the field's label; a
  // part's number is kept.
  const RULING = /^(RULING|Ruling)( (\d+((,| and| or) \d+)*))?(:| –)\s*/;
  // A citation closing a ruling's last sentence on the same line.
  const INLINE_CITE = /^(.*[.!?”"]) (\(Rules? .*)$/;
  const PART = /^\d+((,| and| or) \d+)*:\s/;
  const NOTE = /^(NOTE|Note):/;
  const CITE = /^\(Rules? /;

  const first = lines.findIndex((l) => l.text === "RULE 1");
  const index = lines.findIndex((l, k) => k > first && l.text === "Index to Rules");
  const rulings = [];
  // The book in order: lines left out (rule headings and titles, topic
  // headings) and plays, for the word-for-word check.
  const outline = [];
  const skip = (l) => outline.push({ text: l.text });
  let cur = null;
  let skipTitle = false;
  let cite = null; // a citation running over more than one line
  const words = (l, text) => ({ ...l, text, words: text.split(" ").filter(Boolean) });
  const ended = () => /[.!?)”"]$/.test(cur.ruling.at(-1)?.text ?? "");

  const body = lines.slice(first < 0 ? 0 : first, index < 0 ? lines.length : index);
  // Whether a line after a citation is more of that ruling: its own
  // citation comes before the next play or rule.
  const citedLater = (from) => {
    for (let j = from; j < body.length; j++) {
      const t = body[j].text;
      if (AR.test(t) || /^RULE \d+$/.test(t)) return false;
      if (CITE.test(t)) return true;
    }
    return false;
  };
  const startRuling = (l, m) => {
    cur.phase = "ruling";
    const rest = l.text.replace(RULING, "");
    ruling(words(l, m[3] ? `${m[3]}: ${rest}` : rest));
  };
  // A ruling line, splitting off a citation that ends it.
  const ruling = (l) => {
    const m = cur.phase === "ruling" && l.text.match(INLINE_CITE);
    if (!m) { if (l.words.length) cur.ruling.push(l); return; }
    cur.ruling.push(words(l, m[1]));
    citation(m[2]);
  };
  // A citation is "(Rule …)", sometimes over more than one line; a few in
  // the book end ")." or never close, and end at the next play.
  const CLOSED = /\)\.?$/;
  const citation = (text) => {
    if (CLOSED.test(text)) { cur.citations.push(text.slice(1).replace(CLOSED, "")); cur.phase = "cited"; }
    else cite = text;
  };
  const flushCite = () => {
    if (cite === null) return;
    cur.citations.push(cite.slice(1));
    report.unclosed.push(`A.R. ${cur.id}`);
    cite = null;
  };

  for (const [i, l] of body.entries()) {
    const ar = l.text.match(AR);
    if (cur && (ar || /^RULE \d+$/.test(l.text))) flushCite();
    if (/^RULE \d+$/.test(l.text)) { cur = closeRuling(cur, rulings); skipTitle = true; skip(l); continue; }
    if (skipTitle) { skipTitle = false; skip(l); continue; } // the rule's title under its heading
    if (ar) {
      cur = closeRuling(cur, rulings);
      outline.push({ play: rulings.length });
      cur = { ruleNumber: Number(ar[1]), id: `${ar[1]}–${ar[2]}`, scenario: [], ruling: [], citations: [], phase: "scenario", note: false };
      const rest = l.text.replace(AR, "");
      if (rest) cur.scenario.push(words(l, rest));
      continue;
    }
    if (!cur) { report.headings.push(l.text); skip(l); continue; }
    if (cite !== null) {
      const text = `${cite} ${l.text}`;
      cite = null;
      citation(text);
      continue;
    }
    if (cur.phase === "scenario") {
      const m = l.text.match(RULING);
      if (m) startRuling(l, m);
      else cur.scenario.push(l);
      continue;
    }
    if (CITE.test(l.text) && (cur.phase === "ruling")) { citation(l.text); continue; }
    if (cur.phase === "ruling") {
      const m = l.text.match(RULING);
      if (m) startRuling(l, m);
      else ruling(l);
      continue;
    }
    // After a citation: another part of the ruling, a note on it, the rest
    // of that note, or else a topic heading before the next play.
    if (PART.test(l.text)) { cur.phase = "ruling"; ruling(l); continue; }
    const m = l.text.match(RULING);
    if (m) { startRuling(l, m); continue; }
    if (NOTE.test(l.text)) {
      cur.phase = "note";
      if (!cur.note) { cur.note = true; report.notes.push(`A.R. ${cur.id}`); }
      cur.ruling.push(l);
      continue;
    }
    if (cur.phase === "note" && !ended()) { cur.ruling.push(l); continue; }
    if (citedLater(i + 1) && !CITE.test(l.text)) {
      // An unnumbered paragraph of the ruling, with a citation of its own.
      cur.phase = "ruling";
      if (!report.continued.includes(`A.R. ${cur.id}`)) report.continued.push(`A.R. ${cur.id}`);
      cur.ruling.push({ ...l, start: true });
      continue;
    }
    report.headings.push(l.text);
    skip(l);
  }
  if (cur) flushCite();
  closeRuling(cur, rulings);

  const plays = rulings.map((r) => {
    const s = join(r.scenario, vocab, { paragraphStart: CASE_PARAGRAPH, overrides, where: `A.R. ${r.id}` });
    const g = join(r.ruling, vocab, { paragraphStart: CASE_PARAGRAPH, overrides, where: `A.R. ${r.id}` });
    report.unresolved.push(...s.unresolved, ...g.unresolved);
    if (r.citations.length === 0) report.noCitation.push(`A.R. ${r.id}`);
    return {
      ruleNumber: r.ruleNumber,
      citation: r.citations.length ? `A.R. ${r.id} (${r.citations.join("; ")})` : `A.R. ${r.id}`,
      scenario: s.paragraphs.join("\n"),
      ruling: g.paragraphs.join("\n"),
    };
  });
  for (const o of outline) if ("play" in o) Object.assign(o, { id: rulings[o.play].id, citations: rulings[o.play].citations });
  return { plays, report, outline };
}

function closeRuling(current, rulings) {
  if (current) rulings.push(current);
  return null;
}

// The word-for-word check: the parsed book against the plain `pdftotext`
// extraction of the same PDF (no layout, page breaks as form feeds). Both
// are compared without whitespace or hyphens (see normalizeForCheck), after
// taking running headers and page numbers out of the plain text, so every
// other character must agree. Returns the parts that don't; empty means
// nothing was changed, dropped, added or reordered.

const RAW_RUNNING = /^(\d+|\[THIS PAGE IS INTENTIONALLY LEFT BLANK\]|(\d+\s+)?RULE \d+ \/\s.*)$/;
function plain(text) {
  const lines = text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, " ").split("\n");
  return normalizeForCheck(lines.filter((l) => !RAW_RUNNING.test(l.trim())).join("\n"));
}

export function checkRulesBook(book, rawText) {
  const raw = plain(rawText);
  const failed = [];
  const changes = book.changes.map((c) => normalizeForCheck(c.text)).join("");
  if (!raw.includes(`${changes}PointsofEmphasis`)) failed.push("rule changes");
  const emphasis = book.emphasis.map((e, k) => `${k + 1}.${normalizeForCheck(e.body)}`).join("");
  if (!raw.includes(`${emphasis}SignificantEditorial`)) failed.push("points of emphasis");
  const rules = normalizeForCheck(book.rules.map((r) => `RULE ${r.number}\n${r.title}\n${r.body}`).join("\n"));
  const start = raw.indexOf(rules.slice(0, 200));
  const end = raw.indexOf("AppendixI", start);
  if (start < 0 || raw.slice(start, end < 0 ? undefined : end) !== rules) failed.push("rules");
  return failed.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}
const ORDER = ["rules", "rule changes", "points of emphasis"];

export function checkCaseBook(book, rawText) {
  const raw = plain(rawText);
  const { outline, plays } = book;
  const failed = [];
  const anchor = (o) => ("play" in o ? normalizeForCheck(`A.R. ${o.id}.`) : normalizeForCheck(o.text));
  // The first rule's heading and title, past the contents pages.
  let at = outline.length > 1 ? raw.indexOf(anchor(outline[0]) + anchor(outline[1])) : -1;
  if (at < 0) return ["start"];
  outline.forEach((o, k) => {
    const a = anchor(o);
    if (!raw.startsWith(a, at)) {
      // Lost text before this point: find our place again and carry on.
      failed.push("play" in o ? `A.R. ${o.id}` : `before “${o.text}”`);
      const found = raw.indexOf(a, at);
      if (found < 0) return;
      at = found;
    }
    at += a.length;
    if (!("play" in o)) return;
    const next = k + 1 < outline.length ? anchor(outline[k + 1]) : "IndextoRules";
    const end = raw.indexOf(next, at);
    let seg = raw.slice(at, end < 0 ? undefined : end).replace(LABEL, "");
    for (const c of o.citations) {
      const i = seg.indexOf(`(${normalizeForCheck(c)}`);
      if (i < 0) continue; // left in, so the comparison fails
      const m = seg.slice(i).match(new RegExp(`^\\(${escape(normalizeForCheck(c))}(\\)\\.?)?`));
      seg = seg.slice(0, i) + seg.slice(i + m[0].length);
    }
    const p = plays[o.play];
    if (seg !== normalizeForCheck(`${p.scenario}${p.ruling}`) && !failed.includes(`A.R. ${o.id}`)) failed.push(`A.R. ${o.id}`);
    at = end < 0 ? raw.length : end;
  });
  return failed;
}
// A ruling's label, without its part numbers ("RULING 2 and 3:" keeps
// "2and3:"); "as in Ruling 1" in a sentence isn't one.
const LABEL = /(RULING|Ruling)(:|–)|(RULING|Ruling)(?=\d+((,|and|or)\d+)*:)/g;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
