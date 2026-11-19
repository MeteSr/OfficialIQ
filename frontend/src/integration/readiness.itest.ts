import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canister, adminCall, ok, err } from "./harness";
import { newIdentity } from "./identities";
import { seedBank, start, play, type Bank } from "./fixtures";

// Certification readiness (issue #65): the official's exam date, and their
// accuracy per rule section, which is Pro once the paywall is on (#71).

let bank: Bank;
beforeAll(async () => { bank = await seedBank(); });
afterAll(async () => { ok(await (await adminCall("user")).setPaywallEnabled(false)); });

const DAY_NS = 86_400_000_000_000n;
const nowNs = () => BigInt(Date.now()) * 1_000_000n;

describe("cert goal", () => {
  it("stores the exam date and template, validates it, and clears it", async () => {
    const user = await canister("user", newIdentity());
    expect(await user.getMyCertGoal()).toEqual([]);
    const when = nowNs() + 30n * DAY_NS;
    const set = ok(await user.setCertGoal([{ examDate: when, templateId: ["tpl0"] }])) as [{ examDate: bigint; templateId: [] | [string] }];
    expect(set[0]).toMatchObject({ examDate: when, templateId: ["tpl0"] });
    expect(((await user.getMyCertGoal()) as { examDate: bigint }[])[0].examDate).toBe(when);

    expect(err(await user.setCertGoal([{ examDate: nowNs() - 3n * DAY_NS, templateId: [] }]))).toEqual({ inPast: null });
    expect(err(await user.setCertGoal([{ examDate: nowNs() + 800n * DAY_NS, templateId: [] }]))).toEqual({ tooFar: null });
    expect(err(await user.setCertGoal([{ examDate: when, templateId: ["x".repeat(200)] }]))).toEqual({ invalidTemplate: null });

    ok(await user.setCertGoal([]));
    expect(await user.getMyCertGoal()).toEqual([]);
  });

  it("is removed with the account", async () => {
    const who = newIdentity();
    const user = await canister("user", who);
    ok(await user.createProfile({ displayName: "Ref", sport: bank.sportId, level: "varsity", state: "OH", preferredLanguage: "en" }));
    ok(await user.setCertGoal([{ examDate: nowNs() + 10n * DAY_NS, templateId: [] }]));
    ok(await user.deleteAccount());
    expect(await user.getMyCertGoal()).toEqual([]);
  });
});

describe("accuracy by section", () => {
  it("counts the caller's own correct and answered questions per article", async () => {
    const who = newIdentity();
    const s = await start(who, bank, 5);
    await play(who, bank, s, 3);
    // The exam canister forwards answers to the question canister in the background.
    let rows: [string, bigint, bigint][] = [];
    for (let i = 0; i < 20 && rows.length === 0; i++) {
      rows = ok(await (await canister("question", who)).getMyArticleAccuracy(bank.sportId)) as [string, bigint, bigint][];
      if (rows.length === 0) await new Promise(r => setTimeout(r, 500));
    }
    expect(rows).toEqual([[bank.art1, 3n, 5n]]);
    expect(ok(await (await canister("question", who)).getMyArticleAccuracy("another_sport"))).toEqual([]);
    expect(ok(await (await canister("question", newIdentity())).getMyArticleAccuracy(bank.sportId))).toEqual([]);
  });

  it("is Pro only once the paywall is on", async () => {
    const admin = await adminCall("user");
    ok(await admin.setPaywallEnabled(true));
    const free = newIdentity();
    const pro = newIdentity();
    ok(await admin.grantComp(pro.getPrincipal(), nowNs() + DAY_NS));
    expect(err(await (await canister("question", free)).getMyArticleAccuracy(bank.sportId))).toEqual({ proOnly: null });
    ok(await (await canister("question", pro)).getMyArticleAccuracy(bank.sportId));
    ok(await admin.setPaywallEnabled(false));
  });
});
