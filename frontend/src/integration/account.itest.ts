import { beforeAll, describe, expect, it } from "vitest";
import { canister, adminCall, ok, err } from "./harness";
import { newIdentity } from "./identities";
import { seedBank, start, play, type Bank } from "./fixtures";

// Deleting an account removes the profile at once; a timer on the user
// canister then has every other canister forget the official, so these
// tests wait for the deletion to finish before checking.

let bank: Bank;
beforeAll(async () => { bank = await seedBank(); });

async function eventually<T>(read: () => Promise<T>, done: (v: T) => boolean, what: string): Promise<T> {
  const until = Date.now() + 60_000;
  for (;;) {
    const v = await read();
    if (done(v)) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 500));
  }
}

describe("account deletion", () => {
  it("removes the official's data from every canister", async () => {
    const who = newIdentity();
    const friend = newIdentity();
    const profile = { displayName: "Leaving", sport: bank.sportId, level: "varsity", state: "OH", preferredLanguage: "en" };
    const user = await canister("user", who);
    ok(await user.createProfile(profile));

    const s = await start(who, bank, 5);
    await play(who, bank, s, 4);
    const ranking = await canister("ranking", who);
    await eventually(async () => (await ranking.getMyStats()) as unknown[], v => v.length === 1, "the ranked result");

    ok(await ranking.addFriend(friend.getPrincipal()));
    const group = ok(await ranking.createGroup("Crew", bank.sportId, "OH", false)) as { id: string };
    ok(await (await canister("ranking", friend)).addFriend(who.getPrincipal()));
    const question = await canister("question", who);
    ok(await question.reportQuestion(bank.ruleIds[0], { WrongAnswer: null }, "Key looks wrong"));

    ok(await user.deleteAccount());
    expect(await user.getMyProfile()).toEqual([]);
    expect(err(await user.createProfile(profile))).toMatch(/still being deleted/);

    await eventually(async () => (await user.getDeletionStatus()) as Record<string, unknown>, v => "NotRequested" in v, "the deletion to finish");

    expect(await ranking.getMyStats()).toEqual([]);
    expect(await ranking.getFriendPrincipals()).toEqual([]);
    expect(await ranking.getGroup(group.id)).toEqual([]);
    expect(await (await canister("ranking", friend)).getFriendPrincipals()).toEqual([]);
    expect(await (await canister("exam", who)).getMyExams()).toEqual([]);
    expect(await question.myOpenReports([bank.ruleIds[0]])).toEqual([]);
    expect(await question.getMyHistoryBatch([s.session.questionIds[0]])).toEqual([[]]);

    // The principal can sign up again once the deletion is done.
    ok(await user.createProfile(profile));
  });

  it("only lets the user canister call forgetUser", async () => {
    const stranger = newIdentity();
    expect(err(await (await canister("ranking", stranger)).forgetUser(stranger.getPrincipal()))).toMatch(/User canister only/);
  });
});

describe("question reports", () => {
  it("allows one open report per official per question", async () => {
    const who = newIdentity();
    const question = await canister("question", who);
    ok(await question.reportQuestion(bank.ruleIds[1], { Unclear: null }, ""));
    expect(err(await question.reportQuestion(bank.ruleIds[1], { Typo: null }, ""))).toMatch(/already reported/);
    expect(await question.myOpenReports([bank.ruleIds[1], bank.ruleIds[2]])).toEqual([bank.ruleIds[1]]);
    expect(err(await question.listQuestionReports(false))).toMatch(/Admin only/);

    const admin = await adminCall("question");
    const open = ok(await admin.listQuestionReports(false)) as { id: string; questionId: string; reporter: { toText(): string } }[];
    const mine = open.find(r => r.reporter.toText() === who.getPrincipal().toText())!;
    expect(mine.questionId).toBe(bank.ruleIds[1]);
    ok(await admin.resolveQuestionReport(mine.id, "Reworded the stem"));
    expect(await question.myOpenReports([bank.ruleIds[1]])).toEqual([]);
  });
});
