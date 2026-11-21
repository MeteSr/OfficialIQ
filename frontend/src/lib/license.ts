// Association seat licenses (issue #78), as the app shows them. The
// association canister enforces everything (backend/lib/License.mo); this
// decides what to show.
import type { Principal } from "@icp-sdk/core/principal";

/** Mirrors License.MIN_SEATS in backend/lib/License.mo. */
export const MIN_SEATS = 10;
/** Dollars per seat per year: the Stripe Price the license checkout uses. */
export const PRICE_PER_SEAT = 36;
const MAX_SEATS = 10_000;

export type License = {
  seats: bigint;
  source: { trial: null } | { manual: null } | { stripe: string } | Record<string, unknown>;
  expiresAt: bigint;
  updatedAt: bigint;
};

export type LicenseView = {
  license: [] | [License];
  active: boolean;
  paywallOn: boolean;
  holders: Principal[];
  memberCount: bigint;
  minSeats: bigint;
  checkoutReady: boolean;
};

export type LicenseClaimError =
  | { associationNotFound: null } | { notCoordinator: null } | { invalidSession: null } | { notConfigured: null }
  | { stripeUnavailable: null } | { notYours: null } | { notComplete: null } | { notSubscription: null }
  | { notActive: null } | { alreadyClaimed: null } | { tooFewSeats: null } | { malformed: null };

/** A gated coordinator call refused for want of a license (`#licenseRequired`). */
export class LicenseRequired extends Error {
  constructor() { super("licenseRequired"); }
}

/** The seat picker's value: a whole number, never below the minimum. */
export function clampSeats(input: string | number): number {
  const n = Math.floor(typeof input === "number" ? input : Number.parseFloat(input));
  if (!Number.isFinite(n)) return MIN_SEATS;
  return Math.min(MAX_SEATS, Math.max(MIN_SEATS, n));
}

export function yearlyTotal(seats: number): number {
  return seats * PRICE_PER_SEAT;
}

export type LicenseStatus = "none" | "trial" | "active" | "lapsed";

export function licenseStatus(v: LicenseView): LicenseStatus {
  const l = v.license[0];
  if (!l) return "none";
  if (!v.active) return "lapsed";
  return "trial" in l.source ? "trial" : "active";
}

/** The message key for a refused claimLicense / startLicenseCheckout. */
export function licenseClaimErrorKey(e: LicenseClaimError | Record<string, null>): string {
  if ("tooFewSeats" in e) return "license.errTooFewSeats";
  if ("notYours" in e || "notCoordinator" in e) return "license.errNotYours";
  if ("alreadyClaimed" in e) return "license.errAlreadyClaimed";
  if ("notActive" in e || "notComplete" in e) return "license.errNotActive";
  if ("invalidSession" in e || "notSubscription" in e) return "license.errInvalidSession";
  if ("notConfigured" in e) return "license.errNotConfigured";
  return "license.errTryAgain";
}
