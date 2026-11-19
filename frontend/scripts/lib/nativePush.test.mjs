import { describe, expect, it } from "vitest";
import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { apnsSender, fcmSender, signJwt } from "./nativePush.mjs";

function parts(jwt) {
  const [h, c, s] = jwt.split(".");
  return { header: JSON.parse(Buffer.from(h, "base64url")), claims: JSON.parse(Buffer.from(c, "base64url")), input: `${h}.${c}`, sig: Buffer.from(s, "base64url") };
}

describe("signJwt", () => {
  it("signs ES256 in JOSE (r||s) form, as APNs requires", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwt = signJwt({ alg: "ES256", kid: "K1" }, { iss: "TEAM" }, privateKey.export({ type: "pkcs8", format: "pem" }));
    const p = parts(jwt);
    expect(p.header).toEqual({ alg: "ES256", kid: "K1" });
    expect(p.sig.length).toBe(64);
    expect(verify("sha256", Buffer.from(p.input), { key: publicKey, dsaEncoding: "ieee-p1363" }, p.sig)).toBe(true);
  });

  it("signs RS256, as Google's token endpoint requires", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" });
    const p = parts(signJwt({ alg: "RS256", typ: "JWT" }, { iss: "a@b" }, pem));
    expect(verify("sha256", Buffer.from(p.input), createPublicKey(pem), p.sig)).toBe(true);
  });
});

describe("senders", () => {
  it("are off until their credentials are set", () => {
    expect(apnsSender({})).toBeNull();
    expect(fcmSender({})).toBeNull();
  });

  it("FCM gets a token once, then sends the notification with the url", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const account = { client_email: "relay@proj.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }), project_id: "proj" };
    const calls = [];
    const fake = async (url, init) => {
      calls.push({ url, init });
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "tok" }));
      return new Response("{}");
    };
    const fcm = fcmSender({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(account) }, fake);
    await fcm.send("reg1", { title: "T", body: "B", url: "/home" });
    await fcm.send("reg2", { title: "T", body: "B", url: "/home" });
    expect(calls.filter(c => c.url.includes("oauth2"))).toHaveLength(1);
    const send = calls.at(-1);
    expect(send.url).toBe("https://fcm.googleapis.com/v1/projects/proj/messages:send");
    expect(send.init.headers.authorization).toBe("Bearer tok");
    expect(JSON.parse(send.init.body).message).toMatchObject({ token: "reg2", notification: { title: "T", body: "B" }, data: { url: "/home" } });
  });
});
