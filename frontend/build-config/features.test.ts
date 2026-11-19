import { describe, expect, it } from "vitest";
import { featuresFromEnv } from "./features";

describe("featuresFromEnv", () => {
  it("launches NCAA only, with audio, clips and push off", () => {
    expect(featuresFromEnv({})).toEqual({
      sports: ["ncaa_basketball"], audio: false, clipSubmissions: false, ai: true, webPush: false, nativePush: false,
      paywall: false, checkout: { monthly: "", yearly: "", portal: "" },
    });
  });

  it("reads each switch from the environment", () => {
    const f = featuresFromEnv({
      LAUNCH_SPORTS: "ncaa_basketball, fiba_basketball", FEATURE_AUDIO: "true", FEATURE_CLIP_SUBMISSIONS: "1",
      FEATURE_AI: "false", FEATURE_NATIVE_PUSH: "on",
    });
    expect(f).toEqual({
      sports: ["ncaa_basketball", "fiba_basketball"], audio: true, clipSubmissions: true, ai: false, webPush: false, nativePush: true,
      paywall: false, checkout: { monthly: "", yearly: "", portal: "" },
    });
  });

  it("turns web push on with the VAPID public key unless switched off", () => {
    expect(featuresFromEnv({ VAPID_PUBLIC_KEY: "BPk" }).webPush).toBe(true);
    expect(featuresFromEnv({ VAPID_PUBLIC_KEY: "BPk", FEATURE_WEB_PUSH: "false" }).webPush).toBe(false);
  });

  it("keeps the paywall off unless switched on, with the Stripe links it needs", () => {
    const links = {
      STRIPE_LINK_MONTHLY: " https://buy.stripe.com/test_m ", STRIPE_LINK_YEARLY: "https://buy.stripe.com/test_y",
      STRIPE_PORTAL_URL: "https://billing.stripe.com/p/login/test",
    };
    expect(featuresFromEnv(links).paywall).toBe(false);
    const on = featuresFromEnv({ ...links, FEATURE_PAYWALL: "true" });
    expect(on.paywall).toBe(true);
    expect(on.checkout).toEqual({
      monthly: "https://buy.stripe.com/test_m", yearly: "https://buy.stripe.com/test_y",
      portal: "https://billing.stripe.com/p/login/test",
    });
  });

  it("won't switch the paywall on without a checkout link to sell Pro with", () => {
    expect(featuresFromEnv({ FEATURE_PAYWALL: "true" }).paywall).toBe(false);
  });
});
