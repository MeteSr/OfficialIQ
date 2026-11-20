// Stores the Cloudflare Stream account the clip library uploads to and plays
// from (issue #29) in the content canister. Run once, and again whenever the
// API token rotates. The token is read only from the environment, never
// written to disk or logged:
//
//   CLOUDFLARE_STREAM_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_STREAM_CUSTOMER_CODE=... \
//     node scripts/set-video-config.mjs [environment]
//
// The token needs only "Stream: Edit" on that account. The customer code is
// the "customer-<code>" part of the account's Stream playback hostname. Like
// the Anthropic key, the token sits in canister state that the subnet's node
// operators could read (docs/DEPLOYMENT.md, "Video hosting").

import { Actor } from "@icp-sdk/core/agent";
import { connect, ensureAdmin, environmentFromArgs } from "./lib/icp.mjs";
import { idlFactory } from "../src/declarations/content/index.ts";

const NETWORK = environmentFromArgs();

async function main() {
  const token = process.env.CLOUDFLARE_STREAM_TOKEN?.trim();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const customerCode = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE?.trim();
  if (!token || !accountId || !customerCode) {
    throw new Error("Set CLOUDFLARE_STREAM_TOKEN, CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_CUSTOMER_CODE (see the top of this script).");
  }
  const { agent, principal, ids } = await connect(NETWORK, ["content"]);
  const content = Actor.createActor(idlFactory, { agent, canisterId: ids.content });
  console.log(`Configuring video hosting as ${principal.toText()} on "${NETWORK}"`);
  await ensureAdmin("content", content, principal);
  const res = await content.setVideoConfig(accountId, customerCode, token);
  if ("err" in res) throw new Error(`setVideoConfig failed: ${res.err}`);
  console.log("  ✓ Cloudflare Stream configured. Set FEATURE_CLIP_SUBMISSIONS=true to show the film room.");
}

main().catch((err) => {
  console.error(`Video config failed: ${err.message}`);
  process.exit(1);
});
