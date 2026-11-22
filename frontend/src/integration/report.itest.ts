import { describe, expect, inject, it } from "vitest";
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { idlFactory as reportIdl } from "../declarations/report";
import { canister, ok, err, type AnyActor } from "./harness";
import { newIdentity } from "./identities";

// Report cards (manual test plan case 19): private by default, readable by
// anyone, signed in or not, once the owner makes one public, and by a
// coordinator it's shared with.

type Report = { id: string; isPublic: boolean; displayName: string; examsCompleted: bigint; avgScore: bigint; owner: { toText(): string } };

const input = (over: Partial<Record<string, unknown>> = {}) => ({
  displayName: "Report Tester", sport: "itest_sport", state: "TX",
  examsCompleted: 3n, avgScore: 84n, monthsActive: 2n, studyHoursEstimated: 5n,
  accuracyTrend: "up", topStrongest: [], topWeakest: [], ...over,
});

async function anonymous(): Promise<AnyActor> {
  const agent = await HttpAgent.create({ host: inject("host"), shouldFetchRootKey: true });
  return Actor.createActor(reportIdl, { agent, canisterId: inject("canisterIds").report });
}

describe("report cards", () => {
  it("keeps a new report private to its owner", async () => {
    const owner = await canister("report", newIdentity());
    const r = ok(await owner.generateReport(input())) as Report;
    expect(r.isPublic).toBe(false);
    expect((await owner.getReport(r.id)) as Report[]).toHaveLength(1);
    expect(await (await canister("report", newIdentity())).getReport(r.id)).toEqual([]);
    expect(await (await anonymous()).getReport(r.id)).toEqual([]);
    expect(((await owner.getMyReports()) as Report[]).map(x => x.id)).toContain(r.id);
  });

  it("shows a public report to anyone, signed in or not, with the stats it was made with", async () => {
    const owner = await canister("report", newIdentity());
    const r = ok(await owner.generateReport(input({ displayName: "Public Tester", avgScore: 91n }))) as Report;
    expect(err(await (await canister("report", newIdentity())).setPublic(r.id, true))).toMatch(/Not your report/);
    expect((ok(await owner.setPublic(r.id, true)) as Report).isPublic).toBe(true);

    const [seen] = (await (await anonymous()).getReport(r.id)) as Report[];
    expect(seen.displayName).toBe("Public Tester");
    expect(seen.avgScore).toBe(91n);
    expect(seen.examsCompleted).toBe(3n);

    ok(await owner.setPublic(r.id, false));
    expect(await (await anonymous()).getReport(r.id)).toEqual([]);
  });

  it("lets a coordinator it's shared with read it and clear the notice", async () => {
    const owner = await canister("report", newIdentity());
    const coordId = newIdentity();
    const coord = await canister("report", coordId);
    const r = ok(await owner.generateReport(input())) as Report;

    expect(err(await coord.shareWithCoordinator(r.id, coordId.getPrincipal()))).toMatch(/Not your report/);
    const share = ok(await owner.shareWithCoordinator(r.id, coordId.getPrincipal())) as { id: string };
    expect((await coord.getReport(r.id)) as Report[]).toHaveLength(1);
    expect(await coord.getMyUnseenShareCount()).toBe(1n);
    expect(err(await owner.markShareSeen(share.id))).toMatch(/Not your notification/);
    ok(await coord.markShareSeen(share.id));
    expect(await coord.getMyUnseenShareCount()).toBe(0n);
  });

  it("checks what goes into a report", async () => {
    const owner = await canister("report", newIdentity());
    expect(err(await owner.generateReport(input({ avgScore: 101n })))).toMatch(/0-100/);
    expect(err(await owner.generateReport(input({ displayName: "x".repeat(101) })))).toMatch(/too long/);
    expect(err(await (await anonymous()).generateReport(input()))).toMatch(/authenticated/);
  });
});
