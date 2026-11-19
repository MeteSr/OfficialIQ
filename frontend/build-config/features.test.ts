import { describe, expect, it } from "vitest";
import { featuresFromEnv } from "./features";

describe("featuresFromEnv", () => {
  it("launches NCAA only, with audio, clips and push off", () => {
    expect(featuresFromEnv({})).toEqual({
      sports: ["ncaa_basketball"], audio: false, clipSubmissions: false, ai: true, webPush: false, nativePush: false,
    });
  });

  it("reads each switch from the environment", () => {
    const f = featuresFromEnv({
      LAUNCH_SPORTS: "ncaa_basketball, fiba_basketball", FEATURE_AUDIO: "true", FEATURE_CLIP_SUBMISSIONS: "1",
      FEATURE_AI: "false", FEATURE_NATIVE_PUSH: "on",
    });
    expect(f).toEqual({
      sports: ["ncaa_basketball", "fiba_basketball"], audio: true, clipSubmissions: true, ai: false, webPush: false, nativePush: true,
    });
  });

  it("turns web push on with the VAPID public key unless switched off", () => {
    expect(featuresFromEnv({ VAPID_PUBLIC_KEY: "BPk" }).webPush).toBe(true);
    expect(featuresFromEnv({ VAPID_PUBLIC_KEY: "BPk", FEATURE_WEB_PUSH: "false" }).webPush).toBe(false);
  });
});
