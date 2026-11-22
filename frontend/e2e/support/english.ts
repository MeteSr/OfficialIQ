import en from "../../src/i18n/en.json";
import es from "../../src/i18n/es.json";

// Finds English left on a screen that should be in Spanish: lines that are
// an English UI string (one that es.json translates differently), and lines
// with common English words, which catches text hardcoded outside the
// translation files. Seeded test content (it says "E2E") and names that
// stay the same in both languages are skipped.

function leaves(o: unknown, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof o === "string") out.set(prefix, o);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

const esByKey = leaves(es);
const ENGLISH_LINES = new Set(
  [...leaves(en)]
    .filter(([key, text]) => esByKey.get(key) !== text && !text.includes("{{") && /[a-z]{3}/i.test(text))
    .map(([, text]) => text.trim().toLowerCase()),
);

const ENGLISH_WORDS = /\b(the|your|you|and|with|this|that|for|from|loading|sign in|sign out|week|today|back|start|continue|study|exam|ranks|profile|settings|friends|questions|streak|accuracy|score|share|search|save|cancel|delete|upgrade|minutes|days)\b/i;
const SKIP = /E2E|NCAA|OfficialIQ|ELO|https?:\/\//;

export function englishLines(screenText: string): string[] {
  return screenText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !SKIP.test(l))
    .filter((l) => ENGLISH_LINES.has(l.toLowerCase()) || ENGLISH_WORDS.test(l));
}
