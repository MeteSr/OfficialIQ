// Polls ranking.getPendingPushEvents() for streak milestones (7/30/100 days)
// crossed since the last run and sends a real Web Push to each subscribed
// official, via their stored subscription in the user canister. Acks each
// event on successful send so it isn't resent next run.
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
//     node scripts/send-pending-push.mjs [network]
//
// Meant to run periodically (cron) or manually by an admin — see
// scripts/send-push.sh. Native (Capacitor/FCM/APNs) tokens are registered
// (see user.mo's PushSubscription#Native) but not sent to yet — that needs
// a real Firebase project / APNs certificate, a human/business task like
// the rest of issue #31's store-submission requirements.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import webpush from "web-push";
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const args = process.argv.slice(2);
const NETWORK = args.find((a) => !a.startsWith("--")) ?? "local";
const IC_HOST = NETWORK === "local" ? "http://127.0.0.1:4943" : "https://ic0.app";

// Same fixed-seed identity used by the other admin scripts.
const SEED_IDENTITY_SEED = new Uint8Array(32).fill(0xcd);

const MILESTONE_COPY = {
  7:   { title: "🔥 7-Day Streak!",   body: "One week of daily study — keep it going." },
  30:  { title: "🔥 30-Day Streak!",  body: "A full month strong. Impressive consistency." },
  100: { title: "🔥 100-Day Streak!", body: "100 days. You're in rare company." },
};

function readEnvFile() {
  const envPath = path.join(REPO_ROOT, ".env");
  const text = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

const rankingIdlFactory = ({ IDL: I }) => {
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  const ResultEvents = I.Variant({ ok: I.Vec(I.Tuple(I.Principal, I.Vec(I.Nat))), err: I.Text });
  return I.Service({
    setAdmin: I.Func([I.Principal], [ResultUnit], []),
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
    setAdmin: I.Func([I.Principal], [ResultUnit], []),
    getSubscriptionFor: I.Func([I.Principal], [ResultSub], ["query"]),
  });
};

async function ensureAdmin(name, actor, principal) {
  const res = await actor.setAdmin(principal);
  if ("err" in res && res.err !== "Unauthorized") {
    throw new Error(`${name}.setAdmin failed: ${res.err}`);
  }
  if ("err" in res) {
    console.log(`  (${name} admin already set to a different principal — assuming it's this identity from a prior run)`);
  } else {
    console.log(`  ${name} admin set to ${principal.toText()}`);
  }
}

async function main() {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!privateKey || !publicKey || !subject) {
    throw new Error(
      "VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, and VAPID_SUBJECT must all be set. " +
      "Generate a key pair with: npx web-push generate-vapid-keys",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const env = readEnvFile();
  const rankingId = env.CANISTER_ID_RANKING;
  const userId = env.CANISTER_ID_USER;
  if (!rankingId || !userId) {
    throw new Error("CANISTER_ID_RANKING / CANISTER_ID_USER not found in .env — run `make deploy` first.");
  }

  const identity = Ed25519KeyIdentity.generate(SEED_IDENTITY_SEED);
  const principal = identity.getPrincipal();
  const agent = new HttpAgent({ host: IC_HOST, identity });
  if (NETWORK === "local") await agent.fetchRootKey();

  const ranking = Actor.createActor(rankingIdlFactory, { agent, canisterId: rankingId });
  const user = Actor.createActor(userIdlFactory, { agent, canisterId: userId });

  console.log(`Sending pending pushes as principal ${principal.toText()} on network "${NETWORK}"`);
  await ensureAdmin("ranking", ranking, principal);
  await ensureAdmin("user", user, principal);

  const pendingRes = await ranking.getPendingPushEvents();
  if ("err" in pendingRes) throw new Error(`getPendingPushEvents: ${pendingRes.err}`);
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

      if ("WebPush" in sub) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.WebPush.endpoint, keys: { p256dh: sub.WebPush.p256dh, auth: sub.WebPush.auth } },
            JSON.stringify({ title: copy.title, body: copy.body, url: "/home" }),
          );
          await ranking.ackPushEvent(memberPrincipal, milestone);
          console.log(`  ✓ ${memberPrincipal.toText()} — ${milestone}-day milestone`);
          sent++;
        } catch (err) {
          console.error(`  ✗ ${memberPrincipal.toText()} — ${milestone}-day milestone: ${err.statusCode ?? ""} ${err.message ?? err}`);
          errors++;
        }
      } else if ("Native" in sub) {
        console.log(`  · ${memberPrincipal.toText()} — ${milestone}-day milestone: native token registered but sending isn't wired yet (needs a Firebase/APNs project — see issue #31)`);
        skipped++;
      }
    }
  }

  console.log("");
  console.log(`Done. Sent: ${sent}, skipped: ${skipped}, errors: ${errors}`);
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("send-pending-push failed:", err);
  process.exit(1);
});
