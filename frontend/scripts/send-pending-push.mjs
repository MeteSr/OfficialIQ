// Polls ranking.getPendingPushEvents() for streak milestones (7/30/100 days)
// crossed since the last run and sends a notification to each subscribed
// official, via their stored subscription in the user canister: Web Push for
// the website, APNs for the iOS app, FCM for the Android app
// (lib/nativePush.mjs). Acks each event on a successful send so it isn't
// resent next run. A channel without its credentials is skipped and its
// events stay queued until they're set.
//
// Motoko/the IC has no usable ECDSA-P256 signing primitive for VAPID JWTs
// (threshold ECDSA is secp256k1, a different curve), so the actual signed,
// encrypted send happens here, off-chain, using the well-tested `web-push`
// library — see backend/ranking/main.mo for why the *decision* of when a
// push is due still lives on-chain.
//
// VAPID keys are self-generated — no external account/service needed:
//   npx web-push generate-vapid-keys
// The public key is safe to commit/build-inject (see vite.config.ts's
// VITE_VAPID_PUBLIC_KEY). The private key must NEVER be committed — pass it
// inline at run time only:
//
//   VAPID_PRIVATE_KEY=... VAPID_PUBLIC_KEY=... VAPID_SUBJECT=mailto:you@example.com \
//     node scripts/send-pending-push.mjs [environment]
//
// Meant to run periodically (cron) or manually by an admin — see
// scripts/send-push.sh. Native credentials (all optional, see docs/MOBILE.md):
//   APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID   iOS (APNs token auth)
//   FCM_SERVICE_ACCOUNT_JSON                 Android (Firebase)

import webpush from "web-push";
import { Actor } from "@icp-sdk/core/agent";
import { connect, environmentFromArgs } from "./lib/icp.mjs";
import { apnsSender, fcmSender } from "./lib/nativePush.mjs";

const NETWORK = environmentFromArgs();

const MILESTONE_COPY = {
  7:   { title: "🔥 7-Day Streak!",   body: "One week of daily study — keep it going." },
  30:  { title: "🔥 30-Day Streak!",  body: "A full month strong. Impressive consistency." },
  100: { title: "🔥 100-Day Streak!", body: "100 days. You're in rare company." },
};

const rankingIdlFactory = ({ IDL: I }) => {
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  const ResultEvents = I.Variant({ ok: I.Vec(I.Tuple(I.Principal, I.Vec(I.Nat))), err: I.Text });
  return I.Service({
    getPendingPushEvents: I.Func([], [ResultEvents], []),
    ackPushEvent: I.Func([I.Principal, I.Nat], [ResultUnit], []),
  });
};

const userIdlFactory = ({ IDL: I }) => {
  const PushSubscription = I.Variant({
    WebPush: I.Record({ endpoint: I.Text, p256dh: I.Text, auth: I.Text }),
    Native: I.Record({ token: I.Text, platform: I.Text }),
  });
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  const ResultSub = I.Variant({ ok: I.Opt(PushSubscription), err: I.Text });
  return I.Service({
    getSubscriptionFor: I.Func([I.Principal], [ResultSub], ["query"]),
  });
};

async function main() {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const subject = process.env.VAPID_SUBJECT;
  const hasWebPush = !!(privateKey && publicKey && subject);
  if (hasWebPush) webpush.setVapidDetails(subject, publicKey, privateKey);
  const apns = apnsSender();
  const fcm = fcmSender();
  if (!hasWebPush && !apns && !fcm) {
    throw new Error(
      "No push channel is configured. Set VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY and VAPID_SUBJECT for the website " +
      "(npx web-push generate-vapid-keys), and/or the APNs and FCM secrets for the apps (docs/MOBILE.md).",
    );
  }
  console.log(`Channels: web push ${hasWebPush ? "on" : "off"}, iOS ${apns ? "on" : "off"}, Android ${fcm ? "on" : "off"}`);

  const { agent, principal, ids } = await connect(NETWORK, ["ranking", "user"]);
  const rankingId = ids.ranking;
  const userId = ids.user;

  const ranking = Actor.createActor(rankingIdlFactory, { agent, canisterId: rankingId });
  const user = Actor.createActor(userIdlFactory, { agent, canisterId: userId });

  // Runs as the dedicated push-relay identity, not the admin: it can read
  // subscriptions and pending events and nothing else, so it never claims
  // admin. Register it once with `node scripts/admin.mjs <env> set-push-relay
  // <principal>` (or the "Admin task" workflow).
  console.log(`Sending pending pushes as principal ${principal.toText()} on network "${NETWORK}"`);

  const pendingRes = await ranking.getPendingPushEvents();
  if ("err" in pendingRes) {
    throw new Error(`getPendingPushEvents: ${pendingRes.err} — is ${principal.toText()} registered as the push relay? ` +
      "Run the \"Admin task\" workflow with task set-push-relay.");
  }
  const pending = pendingRes.ok;

  let sent = 0, skipped = 0, errors = 0;

  for (const [memberPrincipal, milestones] of pending) {
    const subRes = await user.getSubscriptionFor(memberPrincipal);
    if ("err" in subRes) {
      console.error(`  ✗ getSubscriptionFor(${memberPrincipal.toText()}): ${subRes.err}`);
      errors += milestones.length;
      continue;
    }
    const subOpt = subRes.ok;
    if (subOpt.length === 0) {
      // No subscription registered — leave the events queued; they'll send
      // once the official opts in, and ack only happens on a real send.
      skipped += milestones.length;
      continue;
    }
    const sub = subOpt[0];

    for (const milestone of milestones) {
      const copy = MILESTONE_COPY[Number(milestone)] ?? { title: "OfficialIQ", body: `${milestone}-day streak!` };

      const message = { title: copy.title, body: copy.body, url: "/home" };
      let send = null;
      if ("WebPush" in sub && hasWebPush) {
        send = () => webpush.sendNotification(
          { endpoint: sub.WebPush.endpoint, keys: { p256dh: sub.WebPush.p256dh, auth: sub.WebPush.auth } },
          JSON.stringify(message),
        );
      } else if ("Native" in sub && sub.Native.platform === "ios" && apns) {
        send = () => apns.send(sub.Native.token, message);
      } else if ("Native" in sub && sub.Native.platform === "android" && fcm) {
        send = () => fcm.send(sub.Native.token, message);
      }
      if (!send) {
        // That channel isn't configured: keep the event for a later run.
        skipped++;
        continue;
      }
      try {
        await send();
        await ranking.ackPushEvent(memberPrincipal, milestone);
        console.log(`  ✓ ${memberPrincipal.toText()} — ${milestone}-day milestone`);
        sent++;
      } catch (err) {
        console.error(`  ✗ ${memberPrincipal.toText()} — ${milestone}-day milestone: ${err.statusCode ?? ""} ${err.message ?? err}`);
        errors++;
      }
    }
  }
  apns?.close();
  fcm?.close();

  console.log("");
  console.log(`Done. Sent: ${sent}, skipped: ${skipped}, errors: ${errors}`);
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("send-pending-push failed:", err);
  process.exit(1);
});
