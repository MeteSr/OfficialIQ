import { beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "@icp-sdk/core/agent";
import { canister, ok, err } from "./harness";
import { newIdentity } from "./identities";
import { seedBank, type Bank } from "./fixtures";
import { adminIdentity } from "./identities";

// Post-game call log (issue #66): notes on calls an official wasn't sure
// about, matched to a rule and queued for review, which puts that rule's
// questions first in their next adaptive quiz.

let bank: Bank;
let art2: string;
let art2Ids: string[] = [];
const HOUR_NS = 3_600_000_000_000n;
const DAY_NS = 24n * HOUR_NS;
const nowNs = () => BigInt(Date.now()) * 1_000_000n;

beforeAll(async () => {
  bank = await seedBank(6, 0);
  // A second article, so the boost has something to beat.
  art2 = `${bank.sportId}:art2`;
  const q = await canister("question", adminIdentity());
  for (let i = 0; i < 3; i++) {
    const added = ok(await q.addQuestion({
      sportId: bank.sportId, articleId: art2, citation: `Art. 2, Sec. ${i}`, stem: `Art 2 question ${i}`,
      choices: ["a", "b", "c", "d"].map(id => ({ id, text: id })), correctId: "a", explanation: "",
      difficulty: { Beginner: null }, isCasebook: false, isPointOfEmphasis: false,
    })) as { id: string };
    art2Ids.push(added.id);
  }
});

async function pastGame(who: Identity, agoNs = 3n * HOUR_NS): Promise<string> {
  return (ok(await (await canister("user", who)).addUpcomingGame({
    opponent: "Central vs North", gameDate: nowNs() - agoNs, sportId: bank.sportId, levelId: "varsity", notes: "", hasStartTime: [true],
  })) as { id: string }).id;
}

type Call = { id: string; gameId: string; note: string; status: Record<string, null>; match: [] | [{ articleId: string; citation: string; playId: [] | [string] }] };

describe("call log", () => {
  it("logs calls against a past game, privately", async () => {
    const who = newIdentity();
    const user = await canister("user", who);
    const gameId = await pastGame(who);
    const recent = (await user.getMyRecentGames()) as { id: string }[];
    expect(recent.map(g => g.id)).toContain(gameId);

    const c = ok(await user.addCallLog(gameId, "Block/charge at the top of the key")) as Call;
    expect(c).toMatchObject({ gameId, note: "Block/charge at the top of the key", status: { open: null }, match: [] });
    ok(await user.addCallLog(gameId, "Was that a backcourt violation?"));
    expect(((await user.getMyCallLogs()) as Call[]).length).toBe(2);
    expect(await (await canister("user", newIdentity())).getMyCallLogs()).toEqual([]);
  });

  it("refuses notes on future, unknown or long-past games, and empty notes", async () => {
    const who = newIdentity();
    const user = await canister("user", who);
    const future = (ok(await user.addUpcomingGame({
      opponent: "Later", gameDate: nowNs() + DAY_NS, sportId: bank.sportId, levelId: "varsity", notes: "", hasStartTime: [true],
    })) as { id: string }).id;
    expect(err(await user.addCallLog(future, "note"))).toEqual({ gameNotPlayed: null });
    expect(err(await user.addCallLog("g-nope", "note"))).toEqual({ gameNotFound: null });
    expect(err(await user.addCallLog(await pastGame(who, 40n * DAY_NS), "note"))).toEqual({ gameTooOld: null });
    expect(err(await user.addCallLog(await pastGame(who), "  "))).toEqual({ emptyNote: null });
    // Someone else's game.
    expect(err(await (await canister("user", newIdentity())).addCallLog(await pastGame(who), "note"))).toEqual({ gameNotFound: null });
  });

  it("queues an accepted rule, which leads the next adaptive quiz until reviewed", async () => {
    const who = newIdentity();
    const user = await canister("user", who);
    const exam = await canister("exam", who);
    const c = ok(await user.addCallLog(await pastGame(who), "Three seconds?")) as Call;

    const queued = ok(await user.setCallMatch(c.id, { articleId: art2, citation: "Art. 2", playId: [] })) as Call;
    expect(queued).toMatchObject({ status: { queued: null }, match: [{ articleId: art2, citation: "Art. 2" }] });
    expect(((await user.getMyReviewQueue()) as Call[]).map(x => x.id)).toEqual([c.id]);

    const pick = async () => (ok(await exam.startGradedSession(
      { sportId: bank.sportId, articleIds: [bank.art1, art2], casebook: false, count: 3n, secPerQ: 60n, mode: { Solo: null } },
      { Picks: [{ articleIds: [bank.art1, art2], casebook: false, count: 3n, difficulty: [], adaptive: true, tag: [] }] },
    )) as { session: { questionIds: string[] } }).session.questionIds;
    expect([...await pick()].sort()).toEqual([...art2Ids].sort());

    ok(await user.markCallReviewed(c.id));
    expect(await user.getMyReviewQueue()).toEqual([]);
    expect(((await user.getMyCallLogs()) as Call[])[0].status).toEqual({ reviewed: null });
    // Without the boost the three are drawn from both articles at random, so
    // it's no longer certain to be art2's; check a few draws.
    let sawArt1 = false;
    for (let i = 0; i < 6 && !sawArt1; i++) sawArt1 = (await pick()).some(id => !art2Ids.includes(id));
    expect(sawArt1).toBe(true);
  });

  it("only lets the user canister boost questions", async () => {
    const q = await canister("question", newIdentity());
    expect(err(await q.setReviewBoost(newIdentity().getPrincipal(), art2, true))).toMatch(/User canister only/);
  });

  it("deletes a call, and the account's calls with the account", async () => {
    const who = newIdentity();
    const user = await canister("user", who);
    ok(await user.createProfile({ displayName: "Ref", sport: bank.sportId, level: "varsity", state: "OH", preferredLanguage: "en" }));
    const gameId = await pastGame(who);
    const a = ok(await user.addCallLog(gameId, "one")) as Call;
    ok(await user.addCallLog(gameId, "two"));
    ok(await user.deleteCallLog(a.id));
    expect(((await user.getMyCallLogs()) as Call[]).map(x => x.note)).toEqual(["two"]);
    expect(err(await user.deleteCallLog(a.id))).toEqual({ notFound: null });
    ok(await user.deleteAccount());
    expect(await user.getMyCallLogs()).toEqual([]);
  });

  it("suggests a rule through the AI assistant, which counts against the daily cap", async () => {
    // No Anthropic key on the local network: the call is counted, then
    // reports that the assistant isn't configured.
    const ai = await canister("ai_proxy", newIdentity());
    const r = await ai.suggestRuleForCall("Block/charge at the top of the key", `${bank.art1} | Art. 1 | Fouls`);
    expect(String(err(r))).toMatch(/configured/);
    expect(((await ai.getMyAiUsage()) as { used: bigint }).used).toBe(1n);
    expect(String(err(await ai.suggestRuleForCall("", "x")))).toMatch(/note/i);
  });
});
