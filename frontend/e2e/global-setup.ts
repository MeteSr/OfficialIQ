import { CANISTERS, ICP_ENVIRONMENT, adminIdentity, icp } from "./support/backend";
import { seedContent } from "./support/seed";

/**
 * Runs once before the browser tests: looks up the local canister IDs, makes
 * the test admin (a fixed identity) the admin of every canister that has one
 * (the first setAdmin must come from a controller, which is the icp identity
 * that deployed them), and seeds the test content. Environment variables set
 * here reach every test worker.
 */
export default async function globalSetup(): Promise<void> {
  const ids: Record<string, string> = {};
  for (const c of CANISTERS) {
    ids[c] = icp(["canister", "status", c, "-e", ICP_ENVIRONMENT, "--id-only"]);
    if (!ids[c]) throw new Error(`Canister ${c} isn't deployed on ${ICP_ENVIRONMENT}. Run: icp network start -d && icp deploy`);
  }
  process.env.E2E_CANISTER_IDS = JSON.stringify(ids);

  const admin = adminIdentity().getPrincipal().toText();
  for (const c of ["question", "user", "exam", "ranking", "content", "ai_proxy", "association"]) {
    const out = icp(["canister", "call", c, "setAdmin", `(principal "${admin}")`, "-e", ICP_ENVIRONMENT]);
    // A re-run against the same network finds the admin already set.
    if (!out.includes("ok") && !out.includes("Unauthorized")) throw new Error(`${c}.setAdmin: ${out}`);
  }

  await seedContent();
}
