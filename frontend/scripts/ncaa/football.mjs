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

/** The Instant Replay Case Book: every line above the text is a running header; page numbers are "36" or "FBC25". */
export const REPLAY_LAYOUT = { header: /./, headerMaxY: 45, footer: /^(\d+|FBC\d+)$/, footerMinY: 550 };

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
    // A wider gap than the page's usual line spacing starts a block (pages
    // differ: 10 to 13pt).
    const steps = rows.slice(1).map((r, k) => Math.round(r.y - rows[k].y));
    const counts = new Map();
    for (const d of steps) counts.set(d, (counts.get(d) ?? 0) + 1);
    // The line spacing: the smallest step that recurs.
    const usual = [...counts].filter(([, n]) => n > 1).map(([d]) => d).sort((a, b) => a - b)[0] ?? Math.min(...steps, 10);
    const gap = Math.max(GAP, usual + 1.5);
    let prevY = null;
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x);
      const words = r.parts.flatMap((l) => l.words);
      out.push({
        page: p.number, x: r.parts[0].x, margin, words, text: words.join(" "),
        start: prevY !== null && r.y - prevY > gap,
      });
      prevY = r.y;
    }
  }
  return out;
}

export function parseFootballBook(pages, { overrides = {} } = {}) {
  const lines = flatten(pages);
  const vocab = buildVocabulary(lines.map((l) => l.words));
  const report = { unresolved: [], headings: [], skipped: [], leads: [], notes: [] };
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
  let block = []; // the margin lines since the last play
  let lead = []; // a lead-in ("Fouls after a touchdown by Team A:") over the plays that follow
  let note = null; // a play a margin "Note:" is being added to
  const skip = (l) => { outline.push({ text: l.text }); };
  const close = () => { cur = null; };
  if (partThree >= 0) {
    // From the first rule's heading, past the list of new rulings.
    const first = at(/^RULE 1$/, partThree);
    for (const l of lines.slice(first, index < 0 ? lines.length : index)) {
      const r = l.text.match(/^RULE (\d+)$/);
      if (r) { close(); rule = Number(r[1]); title = true; block = []; lead = []; note = null; skip(l); continue; }
      if (title) {
        if (!/^SECTION \d+\./.test(l.text)) { skip(l); continue; }
        title = false;
      }
      const ar = l.text.match(/^Approved Ruling (\d+-\d+-\d+)$/);
      if (ar) { close(); base = ar[1]; number = 0; block = []; lead = []; note = null; skip(l); continue; }
      if (/^SECTION \d+\./.test(l.text)) { close(); block = []; lead = []; note = null; skip(l); report.headings.push(l.text); continue; }
      // "I.", "II." …; a few are printed without the period, so a bare
      // numeral counts only as the next one in its group.
      const rn = l.text.match(ROMAN);
      const n = rn ? romanValue(rn[1]) : 0;
      if (rn && base && (rn[2] === "." || n === number + 1)) {
        // Margin text ending in a colon, straight before a play, leads the
        // plays under it; any other margin text is a heading and ends it.
        if (block.length) {
          const text = block.map((b) => b.text).join(" ");
          if (text.endsWith(":") && !/(—|--)ARTICLES? /.test(text)) {
            lead = block;
            report.headings.splice(report.headings.indexOf(text), 1);
            report.leads.push(text);
          } else lead = [];
        }
        block = [];
        note = null;
        heading = false;
        number = n;
        const mark = `${rn[1]}${rn[2]}`;
        cur = { ruleNumber: rule, id: `${base}-${rn[1]}`, lead, lines: [{ ...l, words: l.words.slice(1), text: l.text.replace(ROMAN, ""), start: false }] };
        rulings.push(cur);
        outline.push({ play: rulings.length - 1, mark });
        continue;
      }
      // Play text is indented; a line at the margin is a heading over the
      // next rulings ("Goal Lines—ARTICLE 2", "Fouls after a touchdown by
      // Team A:"), however many lines it takes.
      if (cur && Math.abs(l.x - l.margin) > 4) { cur.lines.push(l); continue; }
      // A note at the margin after a play is on that play (the rest of it
      // follows without a gap).
      if ((cur && /^(Note|NOTE):/.test(l.text)) || (note && !l.start)) {
        note = note ?? cur;
        if (!report.notes.includes(`A.R. ${note.id}`)) report.notes.push(`A.R. ${note.id}`);
        note.lines.push(/^(Note|NOTE):/.test(l.text) ? { ...l, start: true } : l);
        close();
        continue;
      }
      note = null;
      block.push(l);
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
    const { facts, decision } = splitRuling(r.lines);
    if (!decision) report.headings.push(`no RULING: A.R. ${r.id}`);
    const leadText = r.lead.length ? join(r.lead.map((l) => ({ ...l, start: false })), `A.R. ${r.id}`).join(" ") : "";
    const factText = join(facts, `A.R. ${r.id}`, PLAY_PARAGRAPH).join("\n");
    return {
      ruleNumber: r.ruleNumber,
      citation: `A.R. ${r.id}`,
      scenario: leadText ? `${leadText}\n${factText}` : factText,
      ruling: join(decision ?? [], `A.R. ${r.id}`, PLAY_PARAGRAPH).join("\n"),
      lead: leadText || undefined,
    };
  });
  return { rules, changes, emphasis, plays, report, outline };
}

/** A play's lines split at "RULING:" (on a line of its own words or mid-line) into the facts and the decision. */
function splitRuling(lines) {
  const k = lines.findIndex((l) => l.words.includes("RULING:"));
  if (k < 0) return { facts: lines, decision: null };
  const w = lines[k].words;
  const at = w.indexOf("RULING:");
  const facts = [...lines.slice(0, k), ...(at > 0 ? [{ ...lines[k], words: w.slice(0, at) }] : [])];
  const after = w.slice(at + 1);
  const decision = [...(after.length ? [{ ...lines[k], words: after }] : []), ...lines.slice(k + 1)];
  if (decision.length) decision[0] = { ...decision[0], start: false };
  return { facts, decision };
}

/**
 * The Instant Replay Case Book's play situations (Part III), all under
 * Rule 12: plays numbered 1, 2, 3 … in sequence ("1. Touching of a free
 * kick", then the facts and "RULING:"), under topic headings. A heading
 * is a line on its own with no closing punctuation; what comes between a
 * heading and its first play ("Note: In each of the following free-kick
 * plays …") applies to every play under it, so it leads each one's facts.
 */
export function parseReplayCaseBook(pages, { overrides = {} } = {}) {
  const all = flatten(pages);
  const vocab = buildVocabulary(all.map((l) => l.words));
  const report = { unresolved: [], headings: [] };
  const start = all.findIndex((l, k) => /^PART III: \d{4} PLAY$/.test(l.text) && all[k + 1]?.text === "SITUATIONS");
  const end = all.findIndex((l) => /^NCAA is a trademark/.test(l.text));
  const lines = all.slice(start < 0 ? 0 : start + 2, end < 0 ? all.length : end);
  const PLAY = /^(\d+)\. (.+)$/;
  const outline = [];
  const rulings = [];
  let number = 0;
  let cur = null;
  let lead = []; // the lines between a heading and its first play
  let inLead = false;
  const isPlay = (l) => { const m = l?.text.match(PLAY); return m && Number(m[1]) === number + 1 ? m : null; };
  for (const [k, l] of lines.entries()) {
    const m = isPlay(l);
    if (m) {
      number += 1;
      inLead = false;
      cur = { number, title: m[2], lines: [], lead: lead.map((x) => ({ ...x, start: false })) };
      rulings.push(cur);
      outline.push({ play: rulings.length - 1, mark: normalizeForCheck(`${number}. ${m[2]}`) });
      continue;
    }
    const next = lines[k + 1];
    // A title that wraps: a short line straight after it, then the gap
    // before the facts.
    if (cur && cur.lines.length === 0 && !l.start && l.words.length <= 8 && next?.start) {
      cur.title += ` ${l.text}`;
      outline.at(-1).mark = normalizeForCheck(`${cur.number}. ${cur.title}`);
      continue;
    }
    const alone = !next || next.start || isPlay(next);
    if ((l.start || !cur) && alone && l.words.length <= 8 && !/[.!?:;)\]”"]$/.test(l.text) && !l.words.includes("RULING:")) {
      report.headings.push(l.text);
      outline.push({ text: l.text });
      cur = null;
      lead = [];
      inLead = true;
      continue;
    }
    if (inLead) { lead.push(l); outline.push({ text: l.text }); continue; }
    if (cur) cur.lines.push(cur.lines.length === 0 ? { ...l, start: false } : l);
    else { report.headings.push(l.text); outline.push({ text: l.text }); }
  }
  const join = (ls, where) => {
    const r = joinMarked(ls, vocab, { overrides, where });
    report.unresolved.push(...r.unresolved);
    return r.paragraphs.join("\n");
  };
  const plays = rulings.map((r) => {
    const citation = `Instant Replay Case Book ${r.number} (${r.title})`;
    const { facts, decision } = splitRuling(r.lines);
    if (!decision) report.headings.push(`no RULING: ${citation}`);
    const leadText = r.lead.length ? join(r.lead, citation) : "";
    const factText = join(facts, citation);
    return {
      ruleNumber: 12, citation,
      scenario: leadText ? `${leadText}\n${factText}` : factText,
      ruling: join(decision ?? [], citation),
      lead: leadText,
    };
  });
  return { plays, report, outline };
}

// The replay case book's running headers ("PART III: 2026 PLAY SITUATIONS
// – Free Kicks37") are each page's first or last line in `pdftotext
// -layout`, its page numbers ("36", "FBC25") at the foot.
export function plainReplay(text) {
  const kept = [];
  for (const page of text.replace(/[\x00-\x08\x0b\x0e-\x1f\x7f]/g, " ").split("\f")) {
    const ls = page.split("\n").map((l) => l.trim()).filter((l) => l !== "");
    const header = (l) => /^(\d+\s+)?PART I+:/.test(l);
    if (ls.length && header(ls[0])) ls.shift();
    // Some pages put the header after the page number, at the foot.
    while (ls.length && (/^(\d+|FBC\d+)$/.test(ls.at(-1)) || /^NCAA is a trademark/.test(ls.at(-1)) || header(ls.at(-1)))) ls.pop();
    kept.push(...ls);
  }
  return normalizeForCheck(kept.join("\n"));
}

export function checkReplayCaseBook(book, rawText) {
  const raw = plainReplay(rawText);
  const { outline, plays } = book;
  const failed = [];
  const anchor = (o) => ("play" in o ? o.mark : normalizeForCheck(o.text));
  if (outline.length < 2) return ["play situations"];
  // Past the contents, which list the same headings.
  let pos = raw.indexOf(`SITUATIONS${anchor(outline[0])}${anchor(outline[1])}`);
  if (pos < 0) return ["play situations"];
  pos += "SITUATIONS".length;
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
    const next = k + 1 < outline.length ? anchor(outline[k + 1]) : null;
    const end = next ? raw.indexOf(next, pos) : raw.length;
    const seg = raw.slice(pos, end < 0 ? undefined : end).replace("RULING:", "");
    const p = plays[o.play];
    const facts = p.lead ? p.scenario.slice(p.lead.length) : p.scenario;
    if (seg !== normalizeForCheck(facts + p.ruling) && !failed.includes(p.citation)) failed.push(p.citation);
    pos = end < 0 ? raw.length : end;
  });
  return failed;
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
    // A lead-in is printed once, before the first play it leads.
    const facts = p.lead ? p.scenario.slice(p.lead.length) : p.scenario;
    if (seg !== normalizeForCheck(facts + p.ruling) && !failed.includes(p.citation)) failed.push(p.citation);
    pos = end < 0 ? raw.length : end;
  });
  return failed;
}
