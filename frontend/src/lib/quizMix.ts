import { questionService, type Question } from "../services/question";
import type { Pick } from "../services/exam";

// "Include casebook plays" adds plays to an article quiz's rule questions.
// The question canister matches `casebook` exactly (true = plays only), so
// a mixed quiz is two picks: rule questions and plays, in this proportion
// where the bank has enough of both (as the monthly quiz).

export const CASEBOOK_SHARE = 0.4;

export type Mix = { rules: number; plays: number };

/** How many rule questions and plays make up a quiz of `count`, given how
 *  many of each there are; a shortfall of one is filled with the other. */
export function splitCount(count: number, includeCasebook: boolean, rulesAvailable: number, playsAvailable: number): Mix {
  if (!includeCasebook) return { rules: Math.min(count, rulesAvailable), plays: 0 };
  let plays = Math.min(Math.round(count * CASEBOOK_SHARE), playsAvailable);
  const rules = Math.min(count - plays, rulesAvailable);
  plays = Math.min(count - rules, playsAvailable);
  return { rules, plays };
}

type PickBase = Omit<Pick, "casebook" | "count">;

/** The exam picks for a mix, without empty ones. */
export function mixedPicks(base: PickBase, mix: Mix): Pick[] {
  const picks: Pick[] = [];
  if (mix.rules > 0) picks.push({ ...base, casebook: false, count: BigInt(mix.rules) });
  if (mix.plays > 0) picks.push({ ...base, casebook: true, count: BigInt(mix.plays) });
  return picks;
}

type Filter = { sportId: string; articleIds: string[] };

/** How many rule questions and plays the bank has for these articles, up to
 *  `limit` each. Offline it counts the cache; a kind with none counts 0. */
export async function available(filter: Filter, includeCasebook: boolean, limit: number): Promise<{ rules: number; plays: number }> {
  const sample = (casebook: boolean) =>
    questionService.sampleQuiz({ ...filter, casebook, difficulty: [], count: BigInt(limit) }).then(qs => qs.length, () => 0);
  const [rules, plays] = await Promise.all([sample(false), includeCasebook ? sample(true) : Promise.resolve(0)]);
  return { rules, plays };
}

/** The mix for a quiz of `count` on these articles. */
export async function mixFor(filter: Filter, count: number, includeCasebook: boolean): Promise<Mix> {
  const a = await available(filter, includeCasebook, count);
  return splitCount(count, includeCasebook, a.rules, a.plays);
}

/** A practice quiz of rule questions and plays, shuffled together. Either
 *  kind failing (e.g. offline with none cached) leaves it out. */
export async function sampleMixed(
  filter: Filter, mix: Mix,
  sample: (f: Filter & { casebook: boolean; difficulty: []; count: bigint }) => Promise<Question[]> = questionService.sampleQuiz,
): Promise<Question[]> {
  const [rules, plays] = await Promise.all([
    mix.rules > 0 ? sample({ ...filter, casebook: false, difficulty: [], count: BigInt(mix.rules) }).catch(() => []) : Promise.resolve([]),
    mix.plays > 0 ? sample({ ...filter, casebook: true, difficulty: [], count: BigInt(mix.plays) }).catch(() => []) : Promise.resolve([]),
  ]);
  const all = [...rules, ...plays];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}
