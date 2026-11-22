// Stores the Stripe settings for association seat licenses (issue #78) in
// the association canister: the restricted key, the per-seat yearly Price,
// and the website origin Stripe Checkout returns coordinators to. Run once,
// and again when the key rotates or the price changes. The key is read only
// from the environment, never written to disk or logged:
//
//   STRIPE_LICENSE_KEY=rk_live_... STRIPE_LICENSE_PRICE_ID=price_... \
//     [APP_ORIGIN=https://app.example.com] node scripts/set-license-stripe.mjs [environment]
//
// The key needs read access to Checkout Sessions and Subscriptions and write
// access to Checkout Sessions, nothing that can move money: it sits in
// canister state and outcall headers that node providers could read
// (docs/DEPLOYMENT.md, "Association licenses"). APP_ORIGIN defaults to the
// frontend canister's icp0.io address.

import { Actor } from "@icp-sdk/core/agent";
import { canisterId, connect, ensureAdmin, environmentFromArgs } from "./lib/icp.mjs";
import { idlFactory } from "../src/declarations/association/index.ts";

const NETWORK = environmentFromArgs();

async function main() {
  const key = process.env.STRIPE_LICENSE_KEY?.trim();
  const priceId = process.env.STRIPE_LICENSE_PRICE_ID?.trim();
  if (!key || !priceId) {
    throw new Error("Set STRIPE_LICENSE_KEY and STRIPE_LICENSE_PRICE_ID (see the top of this script).");
  }
  if (!/^price_[A-Za-z0-9_]+$/.test(priceId)) throw new Error(`"${priceId}" isn't a Stripe Price id (price_...).`);
  let appUrl = process.env.APP_ORIGIN?.trim();
  if (!appUrl) {
    const frontend = canisterId("frontend", NETWORK);
    if (!frontend) throw new Error("Set APP_ORIGIN: there's no frontend canister id for this environment.");
    appUrl = `https://${frontend}.icp0.io`;
  }
  appUrl = new URL(appUrl).origin;

  const { agent, principal, ids } = await connect(NETWORK, ["association"]);
  const association = Actor.createActor(idlFactory, { agent, canisterId: ids.association });
  console.log(`Configuring license checkout as ${principal.toText()} on "${NETWORK}" (returns to ${appUrl})`);
  await ensureAdmin("association", association, principal);
  const res = await association.setLicenseStripe([{ key, priceId, appUrl }]);
  if ("err" in res) throw new Error(`setLicenseStripe failed: ${Object.keys(res.err)[0]}`);
  console.log("  ✓ License checkout configured. Coordinators can buy seats from their association's License page.");
}

main().catch((err) => {
  console.error(`License config failed: ${err.message}`);
  process.exit(1);
});
