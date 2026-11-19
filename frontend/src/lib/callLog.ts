// Post-game call log (issue #66): the candidate rules the app offers the
// AI matcher (ai_proxy.suggestRuleForCall), and reading its reply. The
// matcher may only name a candidate; anything else is ignored, and the
// official picks the rule themselves.

export type Candidate = {
  /** Article id, or "play:<playId>" for a casebook play. */
  id: string;
  kind: "article" | "play";
  articleId: string;
  playId: string | null;
  citation: string;
  title: string;
};

export type CallMatch = { articleId: string; citation: string; playId: [] | [string] };

/** Mirrors ai_proxy's MAX_CONTEXT_CHARS. */
export const MAX_CANDIDATE_CHARS = 6_000;

const line = (c: Candidate) => `${c.id} | ${c.citation} | ${c.title}`;

/** Every article (rulebook order), then casebook plays until the size budget. */
export function buildCandidates(
  articles: { id: string; number: bigint; title: string }[],
  plays: { id: string; articleId: string; citation: string; scenario: string }[],
  maxChars = MAX_CANDIDATE_CHARS,
): Candidate[] {
  const out: Candidate[] = [...articles]
    .sort((a, b) => Number(a.number) - Number(b.number))
    .map(a => ({ id: a.id, kind: "article", articleId: a.id, playId: null, citation: `Art. ${Number(a.number)}`, title: a.title }));
  let size = out.reduce((n, c) => n + line(c).length + 1, 0);
  for (const p of plays) {
    const c: Candidate = {
      id: `play:${p.id}`, kind: "play", articleId: p.articleId, playId: p.id, citation: p.citation,
      title: p.scenario.length > 80 ? `${p.scenario.slice(0, 80)}…` : p.scenario,
    };
    if (size + line(c).length + 1 > maxChars) break;
    out.push(c);
    size += line(c).length + 1;
  }
  return out;
}

export function candidatesText(cands: Candidate[]): string {
  return cands.map(line).join("\n");
}

/** The candidate the matcher chose, or null if its reply doesn't name one. */
export function parseSuggestion(raw: string, cands: Candidate[]): { candidate: Candidate; reason: string } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  const { id, reason } = parsed as { id?: unknown; reason?: unknown };
  if (typeof id !== "string") return null;
  const candidate = cands.find(c => c.id === id);
  return candidate ? { candidate, reason: typeof reason === "string" ? reason : "" } : null;
}

export function matchFor(c: Candidate): CallMatch {
  return { articleId: c.articleId, citation: c.citation, playId: c.playId ? [c.playId] : [] };
}
