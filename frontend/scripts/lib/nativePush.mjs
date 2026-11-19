// Sends a notification to a phone through Apple's and Google's push services,
// for scripts/send-pending-push.mjs. Node built-ins only (crypto, http2,
// fetch), so the relay needs no extra packages next to its identity.
//
//   iOS      APNs, token-based auth: an APNs key (.p8) from the Apple
//            Developer account. The app registers its raw APNs device token.
//   Android  Firebase Cloud Messaging HTTP v1: a Firebase service account.
//            The app registers its FCM registration token.
//
// Each sender is built only when its credentials are set; a platform without
// them leaves its events queued (docs/MOBILE.md, "Push notifications").

import { createPrivateKey, sign } from "node:crypto";
import http2 from "node:http2";

const b64url = (data) => Buffer.from(typeof data === "string" ? data : JSON.stringify(data)).toString("base64url");

/** A signed JWT. ES256 signatures are raw r||s (JOSE), not DER. */
export function signJwt(header, claims, privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  const input = `${b64url(header)}.${b64url(claims)}`;
  const sig = header.alg === "ES256"
    ? sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" })
    : sign("sha256", Buffer.from(input), key);
  return `${input}.${sig.toString("base64url")}`;
}

/**
 * APNs sender, or null without APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID.
 * APNS_TOPIC defaults to the app id; APNS_SANDBOX=true targets development
 * builds (TestFlight and App Store builds use production).
 */
export function apnsSender(env = process.env) {
  const keyP8 = env.APNS_KEY_P8?.trim();
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  if (!keyP8 || !keyId || !teamId) return null;
  const topic = env.APNS_TOPIC?.trim() || "app.officialiq.study";
  const host = env.APNS_SANDBOX === "true" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  // One token for the run: Apple accepts it for an hour.
  const jwt = signJwt({ alg: "ES256", kid: keyId }, { iss: teamId, iat: Math.floor(Date.now() / 1000) }, keyP8);
  let session;

  return {
    async send(deviceToken, { title, body, url }) {
      session ??= http2.connect(host);
      const payload = JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, url });
      await new Promise((resolve, reject) => {
        const req = session.request({
          ":method": "POST",
          ":path": `/3/device/${deviceToken}`,
          authorization: `bearer ${jwt}`,
          "apns-topic": topic,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        });
        let status = 0;
        let text = "";
        req.on("response", (h) => { status = Number(h[":status"]); });
        req.setEncoding("utf8");
        req.on("data", (d) => { text += d; });
        req.on("end", () => (status === 200 ? resolve() : reject(new Error(`APNs ${status} ${text}`))));
        req.on("error", reject);
        req.end(payload);
      });
    },
    close() { session?.close(); },
  };
}

/** FCM sender, or null without FCM_SERVICE_ACCOUNT_JSON. */
export function fcmSender(env = process.env, fetchImpl = fetch) {
  const raw = env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  const account = JSON.parse(raw);
  let accessToken;

  async function token() {
    if (accessToken) return accessToken;
    const now = Math.floor(Date.now() / 1000);
    const assertion = signJwt({ alg: "RS256", typ: "JWT" }, {
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }, account.private_key);
    const res = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!res.ok) throw new Error(`FCM auth ${res.status} ${await res.text()}`);
    accessToken = (await res.json()).access_token;
    return accessToken;
  }

  return {
    async send(registrationToken, { title, body, url }) {
      const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token: registrationToken,
            notification: { title, body },
            data: { url },
            android: { priority: "high" },
          },
        }),
      });
      if (!res.ok) throw new Error(`FCM ${res.status} ${await res.text()}`);
    },
    close() {},
  };
}
