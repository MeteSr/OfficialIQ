import { beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "@icp-sdk/core/agent";
import { canister, ok, err } from "./harness";
import { newIdentity } from "./identities";
import { seedBank, play, config, type Bank, type Start } from "./fixtures";

// A challenge is a fixed set of questions; each player gets one graded
// session for it (resumed, never restarted), and its result is read from the
// exam canister.

let bank: Bank;
beforeAll(async () => { bank = await seedBank(); });

async function startSet(who: Identity, ids: string[]): Promise<Start> {
  return ok(await (await canister("exam", who)).startGradedSession(config(bank, ids.length), { Ids: ids })) as Start;
}

type Challenge = { id: string; status: Record<string, null>; results: { score: bigint }[] };

describe("challenges", () => {
  it("runs a challenge from send to completed", async () => {
    const a = newIdentity();
    const b = newIdentity();
    const ids = bank.ruleIds.slice(0, 5);
    const ch = ok(await (await canister("challenge", a)).sendChallenge(b.getPrincipal(), bank.sportId, [bank.art1], ids, 5n)) as Challenge;

    const bChallenges = (await (await canister("challenge", b)).getMyChallenges()) as Challenge[];
    expect(bChallenges.map(c => c.id)).toContain(ch.id);

    // Starting again resumes the same session instead of a fresh retake.
    const sa = await startSet(a, ids);
    expect((await startSet(a, ids)).session.id).toBe(sa.session.id);
    expect(sa.session.questionIds).toEqual(ids);

    await play(a, bank, sa, 5);
    const challengeA = await canister("challenge", a);
    ok(await challengeA.submitGradedResult(ch.id, sa.session.id));
    expect(err(await challengeA.submitGradedResult(ch.id, sa.session.id))).toMatch(/already used/);

    const sb = await startSet(b, ids);
    await play(b, bank, sb, 2);
    const done = ok(await (await canister("challenge", b)).submitGradedResult(ch.id, sb.session.id)) as Challenge;
    expect(Object.keys(done.status)).toEqual(["Completed"]);
    expect(done.results.map(r => r.score).sort()).toEqual([40n, 100n]);
  });

  it("refuses a session on other questions", async () => {
    const a = newIdentity();
    const b = newIdentity();
    const ch = ok(await (await canister("challenge", a)).sendChallenge(b.getPrincipal(), bank.sportId, [bank.art1], bank.ruleIds.slice(0, 5), 5n)) as Challenge;
    const other = await startSet(b, bank.ruleIds.slice(5, 10));
    await play(b, bank, other, 5);
    expect(err(await (await canister("challenge", b)).submitGradedResult(ch.id, other.session.id))).toMatch(/doesn't match/);
  });

  it("refuses a player who isn't in the challenge", async () => {
    const a = newIdentity();
    const ids = bank.ruleIds.slice(0, 5);
    const ch = ok(await (await canister("challenge", a)).sendChallenge(newIdentity().getPrincipal(), bank.sportId, [bank.art1], ids, 5n)) as Challenge;
    const outsider = newIdentity();
    const s = await startSet(outsider, ids);
    await play(outsider, bank, s, 5);
    expect(err(await (await canister("challenge", outsider)).submitGradedResult(ch.id, s.session.id))).toMatch(/Not a participant/);
  });
});
