// Game clips (the clip library in the content canister, backend/lib/Clips.mo):
// the "you make the call" stop, the upload form, and the film room's grouping.

/** What an uploader agrees to; the content canister records the same words. */
export const RIGHTS_STATEMENT = "I filmed this footage or have permission to share it for officials' training, and the people identifiable in it agreed to its use.";

/** Whether playback has reached a clip's call that hasn't been answered yet. */
export function atCall(currentTime: number, callAtSec: number | null, answered: boolean): boolean {
  return callAtSec !== null && !answered && currentTime >= callAtSec;
}

/** Where a seek may go: not past an unanswered call. */
export function seekLimit(target: number, callAtSec: number | null, answered: boolean): number {
  return callAtSec !== null && !answered && target > callAtSec ? callAtSec : target;
}

export type ClipForm = {
  uploadId: string;
  sportId: string;
  articleId: string;
  sectionKey: string; // "" for the whole rule
  playId: string; // "" for none
  title: string;
  description: string;
  makeTheCall: boolean;
  callAtSec: string;
  stem: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  visibility: string; // "everyone" or an association id
  rightsAttested: boolean;
};

const IDS = ["a", "b", "c", "d", "e"];

/** What the form still needs, by field, in the order it shows them. */
export function formProblems(f: ClipForm): string[] {
  const problems: string[] = [];
  if (!f.articleId) problems.push("articleId");
  if (!f.title.trim()) problems.push("title");
  if (f.makeTheCall) {
    const at = Number(f.callAtSec);
    if (f.callAtSec.trim() === "" || !Number.isInteger(at) || at < 0 || at > 180) problems.push("callAtSec");
    if (!f.stem.trim()) problems.push("stem");
    const filled = f.choices.filter((c) => c.trim());
    if (filled.length < 2) problems.push("choices");
    else if (!f.choices[f.correctIndex]?.trim()) problems.push("correct");
    if (!f.explanation.trim()) problems.push("explanation");
  }
  if (!f.rightsAttested) problems.push("rights");
  return problems;
}

/** The content canister's ClipInput for a complete form. */
export function clipInput(f: ClipForm) {
  // Choices keep their letters in order, skipping blank ones.
  const kept = f.choices.map((text, i) => ({ text: text.trim(), i })).filter((c) => c.text);
  const choices = kept.map((c, k) => ({ id: IDS[k], text: c.text }));
  const correctId = IDS[kept.findIndex((c) => c.i === f.correctIndex)] ?? "";
  return {
    uploadId: f.uploadId, sportId: f.sportId, articleId: f.articleId,
    sectionKey: f.sectionKey ? [f.sectionKey] as [string] : [] as [],
    playId: f.playId ? [f.playId] as [string] : [] as [],
    title: f.title.trim(), description: f.description.trim(),
    callAtSec: f.makeTheCall ? [BigInt(Number(f.callAtSec))] as [bigint] : [] as [],
    question: f.makeTheCall
      ? [{ stem: f.stem.trim(), choices, correctId, explanation: f.explanation.trim() }] as [{ stem: string; choices: { id: string; text: string }[]; correctId: string; explanation: string }]
      : [] as [],
    visibility: f.visibility === "everyone" ? { everyone: null } : { association: f.visibility },
    rightsAttested: f.rightsAttested,
  };
}

const ruleNumber = (articleId: string) => Number(articleId.match(/:art(\d+)/)?.[1] ?? 0);

/** Clips grouped under their rule, rules in order. */
export function groupByRule<T extends { articleId: string }>(clips: T[]): { articleId: string; clips: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const c of clips) groups.set(c.articleId, [...(groups.get(c.articleId) ?? []), c]);
  return [...groups].sort((a, b) => ruleNumber(a[0]) - ruleNumber(b[0])).map(([articleId, cs]) => ({ articleId, clips: cs }));
}
