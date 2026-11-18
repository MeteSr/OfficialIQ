// Guards issue #32's "no English leaking into Spanish" criterion against
// regressions: every key the code asks for must exist, and en/es must carry
// the same keys (including plural forms), so a missed string shows up here
// rather than as a raw key or an English fallback on screen.
import { describe, expect, it } from "vitest";
import en from "./en.json";
import es from "./es.json";

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === "string") out.set(prefix + k, v);
    else for (const [kk, vv] of flatten(v, `${prefix}${k}.`)) out.set(kk, vv);
  }
  return out;
}

// Every non-test source file under src/, as raw text (Vite resolves this at build time).
const sources = import.meta.glob(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"], {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

const enKeys = flatten(en as Tree);
const esKeys = flatten(es as Tree);
// `count` only selects the plural form, so a language may show it where English doesn't.
const placeholders = (s: string) =>
  [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).filter((p) => p !== "count").sort();

describe("i18n coverage", () => {
  it("es has exactly the same keys as en", () => {
    expect([...esKeys.keys()].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys.keys()].filter((k) => !esKeys.has(k))).toEqual([]);
  });

  it("es keeps every interpolation placeholder from en", () => {
    const mismatched = [...enKeys].filter(([k, v]) => {
      const e = esKeys.get(k);
      return e !== undefined && placeholders(e).join() !== placeholders(v).join();
    }).map(([k]) => k);
    expect(mismatched).toEqual([]);
  });

  it("every literal t() key used in src exists in en", () => {
    const missing: string[] = [];
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    for (const [file, text] of Object.entries(sources)) {
      for (const m of text.matchAll(/\bt\(\s*["'`]([\w.]+)["'`]/g)) {
        const k = m[1];
        if (!enKeys.has(k) && !enKeys.has(`${k}_one`) && !enKeys.has(`${k}_other`)) missing.push(`${file}: ${k}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
