import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "@icp-sdk/core/agent";
import { canister, adminCall, ok, err } from "./harness";
import { adminIdentity, newIdentity } from "./identities";
import { seedBank, type Bank } from "./fixtures";

// Association seat licenses (issue #78). The paywall switch is canister-wide,
// so it is switched on for this file and off again afterwards (files run one
// at a time, see vitest.integration.config.ts). No Stripe key is set on the
// local network, so checkout and claims stop at "not configured"; the claim
// and renewal rules are unit-tested (test/License.test.mo).

let bank: Bank;
const DAY_NS = 86_400_000_000_000n;
const nowNs = () => BigInt(Date.now()) * 1_000_000n;
const due = () => BigInt(Date.now() + 7 * 86_400_000) * 1_000_000n;

beforeAll(async () => {
  bank = await seedBank();
  ok(await (await adminCall("user")).setPaywallEnabled(true));
});
afterAll(async () => {
  ok(await (await adminCall("user")).setPaywallEnabled(false));
});

async function official(role?: "Coordinator") {
  const who = newIdentity();
  ok(await (await canister("user", who)).createProfile({ displayName: "Ref", sport: bank.sportId, level: "varsity", state: "OH", preferredLanguage: "en" }));
  if (role) ok(await (await adminCall("user")).setRole(who.getPrincipal(), { Coordinator: null }));
  return who;
}

async function association() {
  const coord = await official("Coordinator");
  const assoc = ok(await (await canister("association", coord)).createAssociation("Licensed Assoc", bank.sportId)) as { id: string; joinCode: string };
  return { coord, assoc };
}

async function join(code: string) {
  const who = await official();
  ok(await (await canister("association", who)).joinAssociation(code));
  return who;
}

async function tier(who: Identity): Promise<string> {
  const mine = (await (await canister("user", who)).getMyEntitlement()) as { tier: Record<string, null> };
  return Object.keys(mine.tier)[0];
}

const text = (p: { toText(): string }) => p.toText();
type View = { license: [] | [{ seats: bigint; source: Record<string, unknown>; expiresAt: bigint }]; active: boolean; holders: { toText(): string }[]; memberCount: bigint; minSeats: bigint };

describe("seat licenses", () => {
  it("gives a new association a 30-day, 25-seat trial once the paywall is on", async () => {
    const { coord, assoc } = await association();
    const view = ok(await (await canister("association", coord)).getLicense(assoc.id)) as View;
    expect(view.active).toBe(true);
    const lic = view.license[0]!;
    expect(lic.seats).toBe(25n);
    expect(Object.keys(lic.source)).toEqual(["trial"]);
    const days = Number((lic.expiresAt - nowNs()) / DAY_NS);
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(30);
    expect(view.minSeats).toBe(10n);
    ok(await (await canister("association", coord)).createAssignment(assoc.id, "Read art 1", [bank.art1], false, due(), []));
  });

  it("gates assignments, requirements and transcripts without a license, and keeps transcripts readable after a lapse", async () => {
    const { coord, assoc } = await association();
    const member = await join(assoc.joinCode);
    const assocC = await canister("association", coord);
    const admin = await adminCall("association");
    const input = { hoursPerSeason: 10n, seasonStartMonth: 8n };

    // No license at all.
    ok(await admin.revokeLicense(assoc.id));
    expect(err(await assocC.createAssignment(assoc.id, "x", [bank.art1], false, due(), []))).toEqual({ licenseRequired: null });
    expect(err(await assocC.setTrainingRequirement(assoc.id, [input]))).toEqual({ licenseRequired: null });
    // Clearing one stays free.
    ok(await assocC.setTrainingRequirement(assoc.id, []));
    expect(err(await (await canister("user", coord)).getMemberTrainingActivity(member.getPrincipal()))).toEqual({ licenseRequired: null });
    expect(err(await (await canister("exam", coord)).getMemberTraining(member.getPrincipal()))).toEqual({ licenseRequired: null });

    // A license that has expired: new work is gated, existing data stays readable.
    ok(await admin.grantLicense(assoc.id, 10n, nowNs() - DAY_NS));
    expect(((ok(await assocC.getLicense(assoc.id))) as View).active).toBe(false);
    expect(err(await assocC.createAssignment(assoc.id, "x", [bank.art1], false, due(), []))).toEqual({ licenseRequired: null });
    ok(await (await canister("user", coord)).getMemberTrainingActivity(member.getPrincipal()));
    ok(await (await canister("exam", coord)).getMemberTraining(member.getPrincipal()));

    // Licensed again.
    ok(await admin.grantLicense(assoc.id, 10n, nowNs() + 30n * DAY_NS));
    ok(await assocC.createAssignment(assoc.id, "x", [bank.art1], false, due(), []));
    ok(await assocC.setTrainingRequirement(assoc.id, [input]));
  });

  it("gives seats to members in join order, and the coordinator can move one", async () => {
    const { coord, assoc } = await association();
    // Admin grants may go below the 10-seat minimum.
    ok(await (await adminCall("association")).grantLicense(assoc.id, 2n, nowNs() + 30n * DAY_NS));
    const a = await join(assoc.joinCode);
    const b = await join(assoc.joinCode);
    const c = await join(assoc.joinCode);
    expect([await tier(a), await tier(b), await tier(c)]).toEqual(["pro", "pro", "free"]);
    // The coordinator isn't seated automatically.
    expect(await tier(coord)).toBe("free");

    const assocC = await canister("association", coord);
    const view = ok(await assocC.getLicense(assoc.id)) as View;
    expect(view.holders.map(text)).toEqual([a, b].map(x => x.getPrincipal().toText()));
    expect(view.memberCount).toBe(3n);

    const moved = ok(await assocC.moveSeat(assoc.id, a.getPrincipal(), c.getPrincipal())) as View;
    expect(moved.holders.map(text)).toEqual([c, b].map(x => x.getPrincipal().toText()));
    expect([await tier(a), await tier(b), await tier(c)]).toEqual(["free", "pro", "pro"]);
    expect(err(await assocC.moveSeat(assoc.id, a.getPrincipal(), b.getPrincipal()))).toEqual({ noSeat: null });
    expect(err(await (await canister("association", b)).moveSeat(assoc.id, b.getPrincipal(), a.getPrincipal()))).toEqual({ notCoordinator: null });

    // Leaving gives the seat to the next member in join order.
    ok(await (await canister("association", b)).leaveAssociation(assoc.id));
    expect([await tier(a), await tier(b), await tier(c)]).toEqual(["pro", "free", "pro"]);

    // Revoking takes every seat's Pro away.
    ok(await (await adminCall("association")).revokeLicense(assoc.id));
    expect([await tier(a), await tier(c)]).toEqual(["free", "free"]);
  });

  it("keeps an official's own Pro when their seat goes", async () => {
    const { assoc } = await association();
    ok(await (await adminCall("association")).grantLicense(assoc.id, 1n, nowNs() + 30n * DAY_NS));
    const a = await join(assoc.joinCode);
    ok(await (await adminCall("user")).grantComp(a.getPrincipal(), nowNs() + 30n * DAY_NS));
    ok(await (await canister("association", a)).leaveAssociation(assoc.id));
    const mine = (await (await canister("user", a)).getMyEntitlement()) as { tier: unknown; entitlements: { source: Record<string, unknown> }[] };
    expect(mine.tier).toEqual({ pro: null });
    expect(mine.entitlements.map(e => Object.keys(e.source)[0])).toEqual(["comp"]);
  });

  it("drops a seat's entitlement when its holder deletes their account", async () => {
    const { assoc } = await association();
    ok(await (await adminCall("association")).grantLicense(assoc.id, 5n, nowNs() + 30n * DAY_NS));
    const a = await join(assoc.joinCode);
    expect(await tier(a)).toBe("pro");
    ok(await (await canister("user", a)).deleteAccount());
    expect(await tier(a)).toBe("free");
  });

  it("only lets the association canister sync seats, and only admins grant licenses", async () => {
    const { coord, assoc } = await association();
    const stranger = newIdentity();
    expect(err(await (await canister("user", stranger)).syncAssociationSeats(assoc.id, [stranger.getPrincipal()], nowNs() + DAY_NS))).toEqual({ notSibling: null });
    expect(err(await (await adminCall("user")).syncAssociationSeats(assoc.id, [stranger.getPrincipal()], nowNs() + DAY_NS))).toEqual({ notSibling: null });
    expect(err(await (await canister("association", coord)).grantLicense(assoc.id, 50n, nowNs() + DAY_NS))).toEqual({ notAdmin: null });
    expect(err(await (await canister("association", coord)).revokeLicense(assoc.id))).toEqual({ notAdmin: null });
    expect(err(await (await canister("association", stranger)).setPaywallFlag(false))).toMatch(/User canister only/);
    expect(err(await (await canister("association", stranger)).getLicense(assoc.id))).toEqual({ notCoordinator: null });
  });

  it("refuses checkouts under 10 seats and claims of sessions that aren't real", async () => {
    const { coord, assoc } = await association();
    const assocC = await canister("association", coord);
    expect(err(await assocC.startLicenseCheckout(assoc.id, 9n))).toEqual({ tooFewSeats: null });
    // No Stripe key on the local network.
    expect(err(await assocC.startLicenseCheckout(assoc.id, 10n))).toEqual({ notConfigured: null });
    expect(err(await assocC.claimLicense(assoc.id, "cs_test_../../v1/charges"))).toEqual({ invalidSession: null });
    expect(err(await assocC.claimLicense(assoc.id, "cs_test_abc123"))).toEqual({ notConfigured: null });
    expect(err(await (await canister("association", newIdentity())).claimLicense(assoc.id, "cs_test_abc123"))).toEqual({ notCoordinator: null });
  });

  it("counts licensed associations and seats in metrics", async () => {
    const { assoc } = await association();
    ok(await (await adminCall("association")).grantLicense(assoc.id, 12n, nowNs() + 30n * DAY_NS));
    const m = (await (await canister("association", adminIdentity())).metrics()) as { licensedAssociations: bigint; totalSeats: bigint; trials: bigint };
    expect(m.licensedAssociations).toBeGreaterThan(0n);
    expect(m.totalSeats).toBeGreaterThanOrEqual(12n);
    expect(m.trials).toBeGreaterThan(0n);
  });

  it("leaves everything open with the paywall off", async () => {
    const { coord, assoc } = await association();
    ok(await (await adminCall("association")).revokeLicense(assoc.id));
    ok(await (await adminCall("user")).setPaywallEnabled(false));
    try {
      ok(await (await canister("association", coord)).createAssignment(assoc.id, "x", [bank.art1], false, due(), []));
    } finally {
      ok(await (await adminCall("user")).setPaywallEnabled(true));
    }
  });
});
