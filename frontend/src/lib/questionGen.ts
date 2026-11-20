// Making the question bank from the imported rule books with the AI proxy
// (ai_proxy.generateScenarios): the scenario generator page and the
// seed-time generate-questions script share these. A rule is sent a
// section at a time, so the AI sees all of it, and approved rulings a few
// at a time, one question each. Every reply is validated before a
// question is kept, and admins review generated questions in the app.

export type RuleSection = { key: string; label: string; context: string };
export type GeneratedQuestion = {
  stem: string;
  choices: { id: string; text: string }[];
  correctId: string;
  explanation: string;
  citation: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced" | "Expert";
};

/** Room for one request's rule text (the proxy's prompt and reply share the model's budget). */
export const SECTION_CHARS = 8000;

const SECTION = /^SECTION (\d+)\./;

/**
 * A rule's sections ("SECTION 3. …"), each with the rule's number and
 * title, split into parts at paragraph breaks where one is longer than
 * `maxChars`. Lines before the first section go with it.
 */
export function ruleSections(article: { id: string; number: bigint | number; title: string; body: string }, maxChars = SECTION_CHARS): RuleSection[] {
  const head = `Rule ${article.number} — ${article.title}`;
  // Group the paragraphs by section; lines before the first go with it.
  const groups: { n: number; heading: string; lines: string[] }[] = [];
  let preamble: string[] = [];
  for (const p of article.body.split("\n")) {
    const m = p.match(SECTION);
    if (m) { groups.push({ n: Number(m[1]), heading: p, lines: [...preamble, p] }); preamble = []; }
    else if (groups.length) groups[groups.length - 1].lines.push(p);
    else preamble.push(p);
  }
  if (groups.length === 0) groups.push({ n: 0, heading: "", lines: preamble });
  const out: RuleSection[] = [];
  for (const g of groups) {
    const label = g.heading || `Rule ${article.number}`;
    const parts: string[][] = [[]];
    let size = 0;
    for (const line of g.lines) {
      if (size > 0 && size + line.length + 1 > maxChars) { parts.push([]); size = 0; }
      parts[parts.length - 1].push(line);
      size += line.length + 1;
    }
    parts.forEach((lines, k) => {
      const many = parts.length > 1;
      const body = k > 0 ? [`${g.heading} (continued)`, ...lines] : lines;
      out.push({
        key: `${article.id}:s${g.n}${many ? `p${k + 1}` : ""}`,
        label: many ? `${label} (part ${k + 1})` : label,
        context: `${head}\n${body.join("\n")}`,
      });
    });
  }
  return out;
}

export function sectionRequest(section: RuleSection, ruleNumber: bigint | number, count: number) {
  return {
    count,
    context: section.context,
    instructions: `Write questions an official must apply this part of the rule to answer, as game situations where you can. Cite the specific Rule ${ruleNumber} section and article in each citation (for example "Rule ${ruleNumber}-1.2"). Use only the rule text given.`,
  };
}

export function casebookRequest(plays: { citation: string; scenario: string; ruling: string }[]) {
  return {
    count: plays.length,
    context: plays.map((p) => `[${p.citation}]\nPlay: ${p.scenario}\nRuling: ${p.ruling}`).join("\n\n"),
    instructions: "Write one question for each approved ruling below, in order: put the play to the official and ask for the correct ruling. Set each question's citation to that ruling's bracketed citation exactly. Use only the rulings given.",
  };
}

export function playBatches<T>(items: T[], size = 5): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const DIFFICULTIES = new Set(["Beginner", "Intermediate", "Advanced", "Expert"]);

/** The questions in an AI reply that are complete and cite what they may; the rest, with why. */
export function parseGenerated(raw: string, { citations }: { citations: (citation: string) => boolean }) {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  let items: unknown;
  try { items = start >= 0 && end > start ? JSON.parse(raw.slice(start, end + 1)) : null; } catch { items = null; }
  if (!Array.isArray(items)) return { questions: [] as GeneratedQuestion[], rejected: ["not a JSON array"] };
  const questions: GeneratedQuestion[] = [];
  const rejected: string[] = [];
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  for (const it of items as Record<string, unknown>[]) {
    const choices = Array.isArray(it?.choices) ? (it.choices as Record<string, unknown>[]).map((c) => ({ id: text(c?.id), text: text(c?.text) })) : [];
    const q = { stem: text(it?.stem), choices, correctId: text(it?.correctId), explanation: text(it?.explanation), citation: text(it?.citation) };
    if (!q.stem) { rejected.push("no stem"); continue; }
    if (choices.length < 2 || choices.length > 5 || choices.some((c) => !c.id || !c.text) || new Set(choices.map((c) => c.id)).size !== choices.length) { rejected.push("needs 2 to 5 choices"); continue; }
    if (!choices.some((c) => c.id === q.correctId)) { rejected.push(`correctId ${q.correctId} isn't a choice`); continue; }
    if (!q.explanation) { rejected.push("no explanation"); continue; }
    if (!q.citation || !citations(q.citation)) { rejected.push(`citation ${q.citation} isn't in the context`); continue; }
    const d = text(it?.difficulty);
    questions.push({ ...q, difficulty: (DIFFICULTIES.has(d) ? d : "Intermediate") as GeneratedQuestion["difficulty"] });
  }
  return { questions, rejected };
}

/** The question tag that records which section or rulings a question was made from (re-runs skip those). */
export function generatedTag(key: string): string {
  return `gen:${key}`.slice(0, 100);
}
