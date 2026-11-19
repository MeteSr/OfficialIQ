import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canister, adminCall, ok, err } from "./harness";
import { adminIdentity, newIdentity } from "./identities";
import { seedBank, start, play, type Bank } from "./fixtures";

// Pro entitlements (issue #71). The paywall switch is canister-wide, so it is
// switched on for this file and off again afterwards (files run one at a
// time, see vitest.integration.config.ts). No Anthropic key is set on the
// local network, so AI calls stop at "not configured" after the daily cap
// is checked and never reach Claude.

let bank: Bank;
const HOUR_NS = 3_600_000_000_000n;
const nowNs = () => BigInt(Date.now()) * 1_000_000n;

beforeAll(async () => {
  bank = await seedBank();
  ok(await (await adminCall("user")).setPaywallEnabled(true));
});
afterAll(async () => {
  ok(await (await adminCall("user")).setPaywallEnabled(false));
});

async function signUp() {
  const who = newIdentity();
  ok(await (await canister("user", who)).createProfile({ displayName: "Ref", sport: bank.sportId, level: "varsity", state: "OH", preferredLanguage: "en" }));
  return who;
}

async function askUntilRefused(who: ReturnType<typeof newIdentity>, max: number): Promise<{ allowed: number; message: string }> {
  const ai = await canister("ai_proxy", who);
  for (let i = 0; i < max; i++) {
    const r = await ai.askRuleAssistant("When is it a travel?", "");
    const e = "err" in r ? String(r.err) : "";
    if (/limit/i.test(e)) return { allowed: i, message: e };
  }
  return { allowed: max, message: "" };
}

describe("entitlements", () => {
  it("starts free, and an admin comp makes it Pro until it expires", async () => {
    const who = await signUp();
    const user = await canister("user", who);
    const before = (await user.getMyEntitlement()) as { tier: Record<string, null>; paywallEnabled: boolean };
    expect(before.tier).toEqual({ free: null });
    expect(before.paywallEnabled).toBe(true);

    ok(await (await adminCall("user")).grantComp(who.getPrincipal(), nowNs() + 24n * HOUR_NS));
    const pro = (await user.getMyEntitlement()) as { tier: Record<string, null>; entitlements: { source: Record<string, unknown> }[] };
    expect(pro.tier).toEqual({ pro: null });
    expect(pro.entitlements.map(e => Object.keys(e.source)[0])).toEqual(["comp"]);

    // A comp that has already ended leaves them free.
    ok(await (await adminCall("user")).grantComp(who.getPrincipal(), nowNs() - HOUR_NS));
    expect(((await user.getMyEntitlement()) as { tier: unknown }).tier).toEqual({ free: null });

    ok(await (await adminCall("user")).grantComp(who.getPrincipal(), nowNs() + HOUR_NS));
    ok(await (await adminCall("user")).revokeComp(who.getPrincipal()));
    expect(((await user.getMyEntitlement()) as { tier: unknown }).tier).toEqual({ free: null });
  });

  it("tells the exam canister when the paywall is switched", async () => {
    // beforeAll switched it on; setPaywallEnabled only returns ok once exam has the flag.
    ok(await (await adminCall("user")).setPaywallEnabled(true));
  });

  it("only lets admins comp, and only sibling canisters ask who is Pro", async () => {
    const who = await signUp();
    const user = await canister("user", who);
    expect(err(await user.grantComp(who.getPrincipal(), nowNs() + HOUR_NS))).toEqual({ notAdmin: null });
    expect(err(await user.revokeComp(who.getPrincipal()))).toEqual({ notAdmin: null });
    expect(err(await user.setPaywallEnabled(false))).toEqual({ notAdmin: null });
    expect(err(await (await canister("exam", who)).setPaywallFlag(false))).toMatch(/User canister only/);
    expect(err(await user.isPro(who.getPrincipal()))).toEqual({ notSibling: null });
    expect(err(await user.accessFor(who.getPrincipal()))).toEqual({ notSibling: null });
    expect(err(await (await adminCall("user")).isPro(who.getPrincipal()))).toEqual({ notSibling: null });
  });

  it("caps the AI assistant at the free limit, and Pro above it", async () => {
    const free = await signUp();
    const capped = await askUntilRefused(free, 10);
    expect(capped.allowed).toBe(3);
    expect(capped.message).toMatch(/free/i);

    const pro = await signUp();
    ok(await (await adminCall("user")).grantComp(pro.getPrincipal(), nowNs() + 24n * HOUR_NS));
    expect((await askUntilRefused(pro, 5)).allowed).toBe(5);
    const usage = (await (await canister("ai_proxy", pro)).getMyAiUsage()) as { limitPerDay: bigint; access: Record<string, null> };
    expect(usage).toMatchObject({ limitPerDay: 50n, access: { pro: null } });
    const freeUsage = (await (await canister("ai_proxy", free)).getMyAiUsage()) as { used: bigint; limitPerDay: bigint };
    expect(freeUsage).toMatchObject({ used: 3n, limitPerDay: 3n });
  });

  it("shows a free official their recent exams", async () => {
    // Hiding exams older than 30 days is unit-tested (test/Billing.test.mo):
    // a local network can't back-date a session.
    const who = await signUp();
    const s = await start(who, bank, 3);
    await play(who, bank, s, 2);
    const exam = await canister("exam", who);
    expect(((await exam.getMyExamHistory()) as { id: string }[]).map(x => x.id)).toContain(s.session.id);
    // The older plain query too, which gives everyone the free window while the paywall is on.
    expect(((await exam.getMyExams()) as { id: string }[]).map(x => x.id)).toContain(s.session.id);
  });

  it("refuses a checkout claim that isn't a real Stripe session id", async () => {
    const who = await signUp();
    const user = await canister("user", who);
    expect(err(await user.claimWebSubscription("cs_test_../../v1/charges"))).toEqual({ invalidSession: null });
    // No Stripe key on the local network.
    expect(err(await user.claimWebSubscription("cs_test_abc123"))).toEqual({ notConfigured: null });
  });

  it("drops entitlements when the account is deleted", async () => {
    const who = await signUp();
    ok(await (await adminCall("user")).grantComp(who.getPrincipal(), nowNs() + 24n * HOUR_NS));
    const user = await canister("user", who);
    ok(await user.deleteAccount());
    const after = (await user.getMyEntitlement()) as { tier: unknown; entitlements: unknown[] };
    expect(after.entitlements).toEqual([]);
    expect(after.tier).toEqual({ free: null });
  });

  it("reports active Pro by source in metrics", async () => {
    const m = (await (await canister("user", adminIdentity())).metrics()) as { proBySource: [string, bigint][] };
    expect(m.proBySource.find(([s]) => s === "comp")?.[1] ?? 0n).toBeGreaterThan(0n);
  });
});
