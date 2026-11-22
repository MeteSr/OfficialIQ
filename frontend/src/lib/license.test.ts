import { describe, expect, it } from "vitest";
import { clampSeats, licenseClaimErrorKey, licenseStatus, yearlyTotal, MIN_SEATS, PRICE_PER_SEAT, type LicenseView } from "./license";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const ns = (ms: number) => BigInt(ms) * 1_000_000n;

function view(license: LicenseView["license"], active: boolean): LicenseView {
  return { license, active, paywallOn: true, holders: [], memberCount: 0n, minSeats: 10n, checkoutReady: true };
}

describe("seat picker", () => {
  it("never goes below 10 seats", () => {
    expect(MIN_SEATS).toBe(10);
    expect(clampSeats("4")).toBe(10);
    expect(clampSeats("")).toBe(10);
    expect(clampSeats("abc")).toBe(10);
    expect(clampSeats("10")).toBe(10);
    expect(clampSeats("37.6")).toBe(37);
    expect(clampSeats(25)).toBe(25);
  });
  it("prices seats at $36 a year each", () => {
    expect(PRICE_PER_SEAT).toBe(36);
    expect(yearlyTotal(10)).toBe(360);
    expect(yearlyTotal(25)).toBe(900);
  });
});

describe("licenseStatus", () => {
  it("names a trial, a bought or granted license, a lapsed one, and none", () => {
    expect(licenseStatus(view([], false))).toBe("none");
    expect(licenseStatus(view([{ seats: 25n, source: { trial: null }, expiresAt: ns(NOW + DAY), updatedAt: 0n }], true))).toBe("trial");
    expect(licenseStatus(view([{ seats: 12n, source: { stripe: "sub_1" }, expiresAt: ns(NOW + DAY), updatedAt: 0n }], true))).toBe("active");
    expect(licenseStatus(view([{ seats: 12n, source: { manual: null }, expiresAt: ns(NOW + DAY), updatedAt: 0n }], true))).toBe("active");
    expect(licenseStatus(view([{ seats: 12n, source: { stripe: "sub_1" }, expiresAt: ns(NOW - DAY), updatedAt: 0n }], false))).toBe("lapsed");
  });
});

describe("licenseClaimErrorKey", () => {
  it("explains each refusal", () => {
    expect(licenseClaimErrorKey({ tooFewSeats: null })).toBe("license.errTooFewSeats");
    expect(licenseClaimErrorKey({ notYours: null })).toBe("license.errNotYours");
    expect(licenseClaimErrorKey({ alreadyClaimed: null })).toBe("license.errAlreadyClaimed");
    expect(licenseClaimErrorKey({ notActive: null })).toBe("license.errNotActive");
    expect(licenseClaimErrorKey({ stripeUnavailable: null })).toBe("license.errTryAgain");
  });
});
