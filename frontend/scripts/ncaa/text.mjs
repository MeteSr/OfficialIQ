// Verbatim text from the NCAA rule books (issue #68 and the content
// launch item): reads `pdftotext -bbox-layout` output, drops running
// headers and page numbers, and rejoins lines into paragraphs without
// changing a word. The one judgement a PDF forces is a hyphen at a line
// end, which may be part of the word ("out-of-bounds") or only a break
// ("distin-guishable"). It is settled from the book itself (how the word is
// spelled where it isn't broken), from a short list of reviewed overrides,
// or reported for review. Nothing here holds NCAA text: the books are
// downloaded and imported at seed time (see import.mjs).

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m);

/** Pages → lines → words, in reading order. */
export function parseBbox(xhtml) {
  const pages = [];
  for (const pm of xhtml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)) {
    const lines = [];
    for (const lm of pm[3].matchAll(/<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g)) {
      // Tabs are spacing, and control characters (a stray backspace after
      // some page numbers) aren't text.
      const words = [...lm[5].matchAll(/<word[^>]*>([\s\S]*?)<\/word>/g)]
        .flatMap((w) => decode(w[1]).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").split(/\s+/))
        .filter(Boolean);
      if (words.length > 0) lines.push({ x: Number(lm[1]), y: Number(lm[2]), words });
    }
    pages.push({ number: pages.length + 1, width: Number(pm[1]), height: Number(pm[2]), lines });
  }
  return pages;
}

/**
 * Drops running headers (a line near the top matching `header`) and page
 * numbers (a number on its own near the bottom). A rule's own heading near
 * the top doesn't match the header pattern, so it stays.
 */
export function stripRunning(pages, { header, headerMaxY, footer = /^\d+$/, footerMinY }) {
  return pages.map((p) => ({
    ...p,
    lines: p.lines.filter((l) => {
      const text = l.words.join(" ");
      if (l.y <= headerMaxY && header.test(text)) return false;
      if (l.y >= footerMinY && footer.test(text)) return false;
      return true;
    }),
  }));
}

const core = (token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();

/** Every whole word in the book, for settling line-end hyphens. */
export function buildVocabulary(lines) {
  const vocab = new Set();
  for (const words of lines) {
    for (const w of words) {
      if (w.endsWith("-")) continue; // a broken fragment, not a whole word
      const c = core(w);
      if (c) vocab.add(c);
    }
  }
  return vocab;
}

/**
 * How to join a line ending in `left` to a line starting with `right`:
 * "join" (the hyphen was only a line break), "keep" (it is part of the
 * word), or null when the book doesn't settle it.
 */
function hyphenDecision(left, right, vocab, overrides) {
  const key = `${left}|${right}`;
  if (overrides && overrides[key]) return overrides[key];
  const stem = left.slice(0, -1);
  if (/\p{N}$/u.test(stem) || /^[\p{Lu}\p{N}]/u.test(right)) return "keep";
  if (core(stem).includes("-")) return "keep"; // a compound broken at one of its hyphens
  const merged = core(stem + right);
  const hyphenated = core(`${stem}-${right}`);
  const hasMerged = vocab.has(merged);
  const hasHyphenated = vocab.has(hyphenated);
  if (hasMerged && !hasHyphenated) return "join";
  if (hasHyphenated && !hasMerged) return "keep";
  return null;
}

/**
 * Rejoins lines (arrays of words) into paragraphs. A line matching
 * `paragraphStart` starts a new paragraph. Unsettled line-end hyphens are
 * kept and listed in `unresolved` for review.
 */
export function joinLines(lines, vocab, { paragraphStart, overrides, where } = {}) {
  const paragraphs = [];
  const unresolved = [];
  let current = "";
  for (const words of lines) {
    const text = words.join(" ");
    if (current === "" ) { current = text; continue; }
    if (paragraphStart && paragraphStart.test(text)) {
      paragraphs.push(current);
      current = text;
      continue;
    }
    const left = current.slice(current.lastIndexOf(" ") + 1);
    if (left.endsWith("—") || left.endsWith("/")) {
      current += text;
    } else if (left.endsWith("-") && left.length > 1) {
      const decision = hyphenDecision(left, words[0], vocab, overrides);
      if (decision === "join") current = current.slice(0, -1) + text;
      else {
        if (decision === null) unresolved.push({ left, right: words[0], where });
        current += text;
      }
    } else {
      current += ` ${text}`;
    }
  }
  if (current !== "") paragraphs.push(current);
  return { paragraphs, unresolved };
}

/** Splits `items` into groups, each starting where `isStart(item, index)` holds (anything before the first is dropped). */
export function groupAt(items, isStart) {
  const groups = [];
  for (const [k, it] of items.entries()) {
    if (isStart(it, k)) groups.push([it]);
    else if (groups.length > 0) groups[groups.length - 1].push(it);
  }
  return groups;
}

/**
 * joinLines for line objects ({ words, start? }): a line marked `start`
 * begins a paragraph whatever it says (a wider gap or an indent in the
 * book, where its words don't show it).
 */
export function joinMarked(lines, vocab, opts) {
  const out = { paragraphs: [], unresolved: [] };
  for (const group of groupAt(lines, (l, k) => k === 0 || l.start)) {
    const r = joinLines(group.map((l) => l.words), vocab, opts);
    out.paragraphs.push(...r.paragraphs);
    out.unresolved.push(...r.unresolved);
  }
  return out;
}

/**
 * The text with whitespace and hyphens removed, for checking an extracted
 * passage against an independent extraction of the same pages: they must
 * agree on every other character, so no word is changed, dropped, added or
 * reordered. (Hyphen decisions are checked separately: see `unresolved`.)
 */
export function normalizeForCheck(s) {
  return s.replace(/[\s­-]+/g, "");
}

export function sameWords(a, b) {
  return normalizeForCheck(a) === normalizeForCheck(b);
}
