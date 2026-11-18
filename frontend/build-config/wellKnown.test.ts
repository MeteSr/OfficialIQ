import { describe, expect, it } from "vitest";
import { wellKnownFiles } from "./wellKnown";

const ORIGIN = "https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io";

describe("wellKnownFiles", () => {
  it("emits nothing without a web origin (local builds)", () => {
    expect(wellKnownFiles({ APPLE_TEAM_ID: "TEAM123456" }, "")).toEqual({});
  });

  it("always declares the native callback to Internet Identity", () => {
    const files = wellKnownFiles({}, ORIGIN);
    expect(Object.keys(files)).toEqual(["ii-auth-callbacks"]);
    expect(JSON.parse(files["ii-auth-callbacks"])).toEqual({ callbacks: [`${ORIGIN}/native-callback`] });
  });

  it("adds the iOS association when the team ID is set", () => {
    const aasa = JSON.parse(wellKnownFiles({ APPLE_TEAM_ID: " TEAM123456 " }, ORIGIN)["apple-app-site-association"]);
    expect(aasa.applinks.details[0].appIDs).toEqual(["TEAM123456.app.officialiq.study"]);
    expect(aasa.applinks.details[0].components[0]["/"]).toBe("/native-callback");
    expect(aasa.webcredentials.apps).toEqual(["TEAM123456.app.officialiq.study"]);
  });

  it("adds Android asset links for every fingerprint given", () => {
    const links = JSON.parse(wellKnownFiles({ ANDROID_CERT_SHA256: "aa:bb, CC:DD" }, ORIGIN)["assetlinks.json"]);
    expect(links[0].target).toEqual({
      namespace: "android_app",
      package_name: "app.officialiq.study",
      sha256_cert_fingerprints: ["AA:BB", "CC:DD"],
    });
  });
});
