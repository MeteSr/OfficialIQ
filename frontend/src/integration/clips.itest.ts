import { beforeAll, describe, expect, it } from "vitest";
import { canister, adminCall, err } from "./harness";
import { newIdentity } from "./identities";
import { seedBank, type Bank } from "./fixtures";

// The clip library's checks that need no video host: the local network
// can't reach Cloudflare, so uploads, review and playback stop at "isn't
// set up" here. The rules on who may see and review a clip are unit-tested
// in test/Clips.test.mo.

let bank: Bank;
beforeAll(async () => { bank = await seedBank(4, 0); });

const input = (over: Record<string, unknown> = {}) => ({
  uploadId: "no-such-upload", sportId: bank.sportId, articleId: bank.art1, sectionKey: [], playId: [],
  title: "Block or charge", description: "", callAtSec: [], question: [],
  visibility: { everyone: null }, rightsAttested: true, ...over,
});

describe("clip library", () => {
  it("says video hosting isn't set up, and only an admin may set it up", async () => {
    const official = await canister("content", newIdentity());
    expect(await official.videoConfigured()).toBe(false);
    expect(err(await official.startClipUpload())).toBe("Video hosting isn't set up yet");
    expect(err(await official.setVideoConfig("acct", "cust", "token"))).toBe("Admin only");
    expect(err(await (await adminCall("content")).setVideoConfig("acct", "", "token"))).toBe("All three values are needed");
  });

  it("needs the rights statement and an upload of your own before saving a clip", async () => {
    const official = await canister("content", newIdentity());
    expect(err(await official.createClip(input({ rightsAttested: false })))).toBe("invalid: rights");
    expect(err(await official.createClip(input({ callAtSec: [5n] })))).toBe("invalid: question");
    expect(err(await official.createClip(input()))).toBe("Unknown upload: start one with startClipUpload");
  });

  it("shows no clips to someone who may not see them", async () => {
    const official = await canister("content", newIdentity());
    expect(await official.listClips(bank.sportId, [])).toEqual([]);
    expect(await official.listClipsToReview()).toEqual([]);
    expect(err(await official.clipPlayback("clip-none"))).toBe("Not found");
    expect(err(await official.listAssociationClips("no-such-association"))).toBe("Members only");
    expect(err(await official.reviewClip("clip-none", true))).toBe("Not found");
  });
});
