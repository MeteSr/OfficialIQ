import { describe, expect, it } from "vitest";
import { checkoutUrl, claimErrorKey, effectivePlan, hasActiveSubscription, FREE_HISTORY_DAYS } from "./plan";

const NOW = 1_800_000_000_000; // ms
const ns = (ms: number) => BigInt(ms) * 1_000_000n;
const ent = (source: Record<string, unknown>, expiresMs: number) => ({ tier: { pro: null }, source, expiresAt: ns(expiresMs), updatedAt: 0n });

describe("effectivePlan", () => {
  it("is Pro for everyone while the paywall is off, whatever the canister says", () => {
    expect(effectivePlan(false, null, NOW)).toEqual({ pro: true, gated: false, proUntil: null });
    expect(effectivePlan(false, { tier: { free: null }, paywallEnabled: true, entitlements: [] }, NOW).gated).toBe(false);
  });
  it("follows the canister's tier once the paywall is on", () => {
    expect(effectivePlan(true, { tier: { free: null }, paywallEnabled: true, entitlements: [] }, NOW)).toEqual({ pro: false, gated: true, proUntil: null });
    const pro = effectivePlan(true, { tier: { pro: null }, paywallEnabled: true, entitlements: [ent({ comp: null }, NOW + 1000), ent({ web: "sub_1" }, NOW + 5000)] }, NOW);
    expect(pro).toEqual({ pro: true, gated: true, proUntil: NOW + 5000 });
  });
  it("treats the canister's own switch being off as no paywall", () => {
    expect(effectivePlan(true, { tier: { free: null }, paywallEnabled: false, entitlements: [] }, NOW).gated).toBe(false);
  });
  it("is free while the plan hasn't loaded", () => {
    expect(effectivePlan(true, null, NOW)).toEqual({ pro: false, gated: true, proUntil: null });
  });
});

describe("hasActiveSubscription", () => {
  it("is true for an unexpired web or store subscription, not a comp or association seat", () => {
    expect(hasActiveSubscription([ent({ web: "sub_1" }, NOW + 1)], NOW)).toBe(true);
    expect(hasActiveSubscription([ent({ appStore: null }, NOW + 1)], NOW)).toBe(true);
    expect(hasActiveSubscription([ent({ web: "sub_1" }, NOW - 1)], NOW)).toBe(false);
    expect(hasActiveSubscription([ent({ comp: null }, NOW + 1), ent({ association: "asc0" }, NOW + 1)], NOW)).toBe(false);
  });
});

describe("checkoutUrl", () => {
  it("tags the Stripe link with the principal so the claim can check it", () => {
    expect(checkoutUrl("https://buy.stripe.com/test_m", "abcde-fgh")).toBe("https://buy.stripe.com/test_m?client_reference_id=abcde-fgh");
    expect(checkoutUrl("https://buy.stripe.com/test_m?locale=es", "abcde-fgh")).toBe("https://buy.stripe.com/test_m?locale=es&client_reference_id=abcde-fgh");
  });
  it("gives nothing without a link or a principal", () => {
    expect(checkoutUrl("", "abcde-fgh")).toBeNull();
    expect(checkoutUrl("https://buy.stripe.com/x", null)).toBeNull();
  });
});

describe("claimErrorKey", () => {
  it("maps each canister error to a message", () => {
    expect(claimErrorKey({ notYours: null })).toBe("plan.errNotYours");
    expect(claimErrorKey({ notComplete: null })).toBe("plan.errNotComplete");
    expect(claimErrorKey({ notActive: null })).toBe("plan.errNotComplete");
    expect(claimErrorKey({ stripeUnavailable: null })).toBe("plan.errTryAgain");
    expect(claimErrorKey({ alreadyClaimed: null })).toBe("plan.errAlreadyClaimed");
    expect(claimErrorKey({ invalidSession: null })).toBe("plan.errInvalid");
  });
});

it("matches the canister's free history window", () => {
  expect(FREE_HISTORY_DAYS).toBe(30);
});
