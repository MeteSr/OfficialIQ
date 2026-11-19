import { describe, it, expect, vi, beforeEach } from "vitest";

const complete = vi.fn();
const claim = vi.fn();
vi.mock("../services/association", async (orig) => {
  const real = await orig<typeof import("../services/association")>();
  return { ...real, associationService: { recordGradedCompletion: (...a: unknown[]) => complete(...a) } };
});
vi.mock("../services/ranking", async (orig) => {
  const real = await orig<typeof import("../services/ranking")>();
  return { ...real, rankingService: { claimExamResult: (...a: unknown[]) => claim(...a) } };
});

import { ClaimRefused } from "../services/ranking";
import { recordAssignmentCompletion, flushPendingActions, isTransient } from "./offlineSync";
import { enqueuePendingAction, getPendingActions, removePendingAction } from "./offlineDb";

async function queued(kind: string) {
  return (await getPendingActions()).filter(a => a.kind === kind);
}

beforeEach(async () => {
  complete.mockReset();
  claim.mockReset();
  for (const a of await getPendingActions()) await removePendingAction(a.id);
});

describe("recordAssignmentCompletion", () => {
  it("queues the completion when the call fails, and replays it", async () => {
    complete.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await recordAssignmentCompletion("asg1", "ex7");
    expect(await queued("recordGradedCompletion")).toHaveLength(1);

    complete.mockResolvedValueOnce(undefined);
    await flushPendingActions();
    expect(complete).toHaveBeenLastCalledWith("asg1", "ex7");
    expect(await queued("recordGradedCompletion")).toHaveLength(0);
  });

  it("doesn't queue a completion the canister refused", async () => {
    complete.mockRejectedValueOnce(new Error("This session was already used"));
    await recordAssignmentCompletion("asg1", "ex8");
    expect(await queued("recordGradedCompletion")).toHaveLength(0);
  });

  it("keeps a queued completion while still offline", async () => {
    complete.mockRejectedValue(new TypeError("Failed to fetch"));
    await recordAssignmentCompletion("asg1", "ex10");
    await flushPendingActions();
    expect(await queued("recordGradedCompletion")).toHaveLength(1);
  });
});

describe("flushPendingActions", () => {
  it("drops an entry the canister refuses instead of blocking the queue", async () => {
    await enqueuePendingAction({ kind: "claimExamResult", sessionId: "ex9", displayName: "Ref", state: "OH" });
    await enqueuePendingAction({ kind: "recordGradedCompletion", assignmentId: "asg2", sessionId: "ex11" });
    claim.mockRejectedValueOnce(new ClaimRefused("Already counted"));
    complete.mockResolvedValueOnce(undefined);
    await flushPendingActions();
    expect(complete).toHaveBeenCalledWith("asg2", "ex11");
    expect(await getPendingActions()).toHaveLength(0);
  });
});

describe("isTransient", () => {
  it("tells a missing answer from a refusal", () => {
    expect(isTransient(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransient(new Error("TransportError (Transport): Failed to fetch HTTP request"))).toBe(true);
    expect(isTransient(new Error("Server returned an error: status 503"))).toBe(true);
    expect(isTransient(new ClaimRefused("Already counted"))).toBe(false);
    expect(isTransient(new Error("Canister trapped: Must be authenticated"))).toBe(false);
  });
});
