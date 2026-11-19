// The official's plan (issue #71), as the app shows it. The canisters
// enforce the limits; this decides what to show: upgrade prompts, the plan
// row, the "last 30 days" note. With the build's paywall switch off, or the
// user canister's, everyone is Pro and nothing is gated.

export type Entitlement = {
  tier: { pro: null };
  source: Record<string, unknown>;
  expiresAt: bigint;
  updatedAt: bigint;
};

export type MyEntitlement = {
  tier: { free: null } | { pro: null };
  paywallEnabled: boolean;
  entitlements: Entitlement[];
};

export type Plan = {
  pro: boolean;
  /** Whether anything is behind the paywall at all. */
  gated: boolean;
  /** When the latest-ending entitlement ends (ms), for the plan row. */
  proUntil: number | null;
};

/** Mirrors Billing.FREE_HISTORY_DAYS in backend/lib/Billing.mo. */
export const FREE_HISTORY_DAYS = 30;
export const PRO_PRICE_MONTHLY = "$7.99";
export const PRO_PRICE_YEARLY = "$49.99";
export const TRIAL_DAYS = 14;

const nsToMs = (ns: bigint) => Number(ns / 1_000_000n);

export function effectivePlan(paywallSwitch: boolean, mine: MyEntitlement | null, now: number): Plan {
  if (!paywallSwitch || (mine && !mine.paywallEnabled)) return { pro: true, gated: false, proUntil: null };
  if (!mine) return { pro: false, gated: true, proUntil: null };
  const live = mine.entitlements.map(e => nsToMs(e.expiresAt)).filter(t => t > now);
  return { pro: "pro" in mine.tier, gated: true, proUntil: live.length ? Math.max(...live) : null };
}

/** A subscription the official pays for themselves, which deleting the account doesn't cancel. */
export function hasActiveSubscription(entitlements: Entitlement[], now: number): boolean {
  return entitlements.some(e =>
    nsToMs(e.expiresAt) > now && ("web" in e.source || "appStore" in e.source || "playStore" in e.source));
}

/** A Stripe Payment Link carrying the official's principal, which claimWebSubscription checks. */
export function checkoutUrl(link: string, principal: string | null): string | null {
  if (!link || !principal) return null;
  const url = new URL(link);
  url.searchParams.set("client_reference_id", principal);
  return url.toString();
}

export type ClaimError =
  | { notSignedIn: null } | { invalidSession: null } | { notConfigured: null } | { stripeUnavailable: null }
  | { notYours: null } | { notComplete: null } | { notSubscription: null } | { notActive: null }
  | { alreadyClaimed: null } | { malformed: null };

export function claimErrorKey(e: ClaimError): string {
  if ("notYours" in e) return "plan.errNotYours";
  if ("notComplete" in e || "notActive" in e) return "plan.errNotComplete";
  if ("alreadyClaimed" in e) return "plan.errAlreadyClaimed";
  if ("invalidSession" in e || "notSubscription" in e || "malformed" in e) return "plan.errInvalid";
  if ("notSignedIn" in e) return "plan.errSignIn";
  return "plan.errTryAgain";
}
