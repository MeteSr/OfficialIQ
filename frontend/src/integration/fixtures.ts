import type { Identity } from "@icp-sdk/core/agent";
import { canister, ok } from "./harness";
import { adminIdentity } from "./identities";

export type Bank = {
  sportId: string;
  art1: string;
  ruleIds: string[];
  casebookIds: string[];
  /** questionId -> correct choice id */
  answer: Map<string, string>;
};

const CHOICES = ["a", "b", "c", "d"];

/**
 * Seeds a question bank under a sport id unique to this run, so tests never
 * pick up questions (or history) from an earlier run on the same network.
 */
export async function seedBank(rules = 12, casebook = 4): Promise<Bank> {
  const sportId = `itest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const art1 = `${sportId}:art1`;
  const q = await canister("question", adminIdentity());
  const bank: Bank = { sportId, art1, ruleIds: [], casebookIds: [], answer: new Map() };
  for (let i = 0; i < rules + casebook; i++) {
    const isCasebook = i >= rules;
    const correctId = CHOICES[i % 4];
    const added = ok(await q.addQuestion({
      sportId, articleId: art1, citation: `Art. 1, Sec. ${i}`, stem: `Question ${i}`,
      choices: CHOICES.map(id => ({ id, text: id.toUpperCase() })),
      correctId, explanation: `Because ${correctId}`,
      difficulty: { Beginner: null }, isCasebook, isPointOfEmphasis: false,
    })) as { id: string };
    (isCasebook ? bank.casebookIds : bank.ruleIds).push(added.id);
    bank.answer.set(added.id, correctId);
  }
  return bank;
}

export function config(bank: Bank, count: number, mode: "Solo" | "Certification" = "Solo") {
  return {
    sportId: bank.sportId, articleIds: [bank.art1], casebook: false,
    count: BigInt(count), secPerQ: 60n, mode: { [mode]: null },
  };
}

export function picks(bank: Bank, count: number, adaptive = false) {
  return { Picks: [{ articleIds: [bank.art1], casebook: false, count: BigInt(count), difficulty: [], adaptive }] };
}

export type Start = { session: { id: string; questionIds: string[] }; questions: Record<string, unknown>[] };

/** Starts a graded session of `count` canister-picked questions. */
export async function start(who: Identity, bank: Bank, count: number): Promise<Start> {
  const exam = await canister("exam", who);
  return ok(await exam.startGradedSession(config(bank, count), picks(bank, count))) as Start;
}

export function wrongChoice(bank: Bank, questionId: string): string {
  return CHOICES.find(c => c !== bank.answer.get(questionId))!;
}

/** Plays a session: answers the first `correct` questions right and the rest wrong, then finishes it. */
export async function play(who: Identity, bank: Bank, s: Start, correct: number): Promise<{ score: bigint }> {
  const exam = await canister("exam", who);
  for (const [i, qid] of s.session.questionIds.entries()) {
    const choice = i < correct ? bank.answer.get(qid)! : wrongChoice(bank, qid);
    ok(await exam.answerQuestion(s.session.id, qid, choice, 5n));
  }
  const done = ok(await exam.finishSession(s.session.id)) as { session: { score: [] | [bigint] } };
  return { score: done.session.score[0] ?? -1n };
}
