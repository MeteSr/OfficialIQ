import { describe, it, expect, vi, beforeEach } from "vitest";

const claim = vi.fn();
vi.mock("../services/ranking", async (orig) => {
  const real = await orig<typeof import("../services/ranking")>();
  return { ...real, rankingService: { claimExamResult: (...a: unknown[]) => claim(...a) } };
});

import { ClaimRefused } from "../services/ranking";
import { claimRankedResult, flushPendingActions } from "./offlineSync";
import { getPendingActions, removePendingAction } from "./offlineDb";

async function queuedClaims() {
  return (await getPendingActions()).filter(a => a.kind === "claimExamResult");
}

describe("claimRankedResult", () => {
  beforeEach(async () => {
    claim.mockReset();
    for (const a of await getPendingActions()) await removePendingAction(a.id);
  });

  it("queues the claim when the call fails, and replays it", async () => {
    claim.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await claimRankedResult("ex7", "Ref", "");
    expect(await queuedClaims()).toHaveLength(1);

    claim.mockResolvedValueOnce(null);
    await flushPendingActions();
    expect(claim).toHaveBeenLastCalledWith("ex7", "Ref", "");
    expect(await queuedClaims()).toHaveLength(0);
  });

  it("doesn't queue a claim the canister refused", async () => {
    claim.mockRejectedValueOnce(new ClaimRefused("Already counted"));
    await claimRankedResult("ex8", "Ref", "OH");
    expect(await queuedClaims()).toHaveLength(0);
  });

  it("drops a queued claim that turns out to be already counted", async () => {
    claim.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await claimRankedResult("ex9", "Ref", "OH");
    claim.mockRejectedValueOnce(new ClaimRefused("Already counted"));
    await flushPendingActions();
    expect(await queuedClaims()).toHaveLength(0);
  });

  it("keeps a queued claim while still offline", async () => {
    claim.mockRejectedValue(new TypeError("Failed to fetch"));
    await claimRankedResult("ex10", "Ref", "OH");
    await flushPendingActions();
    expect(await queuedClaims()).toHaveLength(1);
  });
});
