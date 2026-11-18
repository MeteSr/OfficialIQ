import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";
import { adminIdentity } from "./identities";

const CANISTERS = ["user", "content", "question", "exam", "ranking", "challenge", "mentorship", "association", "report"] as const;

function icp(args: string[]): string {
  return execFileSync("icp", args, { encoding: "utf8", cwd: new URL("../../..", import.meta.url).pathname }).trim();
}

declare module "vitest" {
  export interface ProvidedContext {
    canisterIds: Record<string, string>;
    host: string;
  }
}

/**
 * Looks up the local canister IDs and makes the test admin (a fixed test
 * identity) the admin of the canisters whose setup needs one. setAdmin's
 * first call must come from a controller, which is the icp CLI identity that
 * deployed them.
 */
export default function setup(project: TestProject) {
  const env = process.env.ICP_ENVIRONMENT ?? "local";
  const ids: Record<string, string> = {};
  for (const c of CANISTERS) {
    ids[c] = icp(["canister", "status", c, "-e", env, "--id-only"]);
    if (!ids[c]) throw new Error(`Canister ${c} isn't deployed on ${env}. Run: icp network start -d && icp deploy`);
  }
  const admin = adminIdentity().getPrincipal().toText();
  for (const c of ["question", "user", "exam", "ranking"]) {
    const out = icp(["canister", "call", c, "setAdmin", `(principal "${admin}")`, "-e", env]);
    // A re-run against the same network finds the admin already set.
    if (!out.includes("ok") && !out.includes("Unauthorized")) throw new Error(`${c}.setAdmin: ${out}`);
  }
  project.provide("canisterIds", ids);
  project.provide("host", process.env.ICP_HOST ?? "http://localhost:8000");
}
