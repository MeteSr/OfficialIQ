// Shared plumbing for the admin scripts (seed-content, generate-audio,
// set-ai-config, send-pending-push). Everything comes from icp-cli, so the
// scripts work against any icp.yaml environment — local, staging or ic:
//
//   - canister IDs:  `icp canister status <name> -e <env> --id-only`
//   - host/root key: `icp network status --json` on the local network;
//                    mainnet uses https://icp-api.io and the built-in root key
//                    (never fetchRootKey — canister-security skill)
//   - identity:      the icp identity the canisters were deployed with
//                    (ICP_IDENTITY, else `icp identity default`), so the
//                    script is a controller and may bootstrap setAdmin.

import { execFileSync } from "node:child_process";
import { createPrivateKey } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Secp256k1KeyIdentity } from "@icp-sdk/core/identity/secp256k1";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function icp(args) {
  return execFileSync("icp", [...args, "--project-root-override", REPO_ROOT], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** The environment named by the first non-flag CLI argument (default "local"). */
export function environmentFromArgs(argv = process.argv.slice(2)) {
  return argv.find((a) => !a.startsWith("--")) ?? "local";
}

export function canisterId(name, environment) {
  try {
    return icp(["canister", "status", name, "-e", environment, "--id-only"]);
  } catch {
    throw new Error(`Canister "${name}" isn't deployed in environment "${environment}" — run \`icp deploy -e ${environment}\` first.`);
  }
}

function loadIdentity() {
  const name = process.env.ICP_IDENTITY || icp(["identity", "default"]);
  if (name === "anonymous") {
    throw new Error(
      "The active icp identity is anonymous, which can't administer canisters. Create one and deploy with it:\n" +
      "  icp identity new dev && icp identity default dev && icp deploy",
    );
  }
  const key = createPrivateKey(icp(["identity", "export", name]));
  const secret = Buffer.from(key.export({ format: "jwk" }).d, "base64url");
  const identity = key.asymmetricKeyType === "ed25519"
    ? Ed25519KeyIdentity.fromSecretKey(secret)
    : Secp256k1KeyIdentity.fromSecretKey(secret);
  return { name, identity };
}

/** Agent + identity for `environment`, plus the IDs of the requested canisters. */
export async function connect(environment, canisterNames) {
  const { name, identity } = loadIdentity();
  let agentOptions = { identity };
  if (environment === "local") {
    const status = JSON.parse(icp(["network", "status", "-e", environment, "--json"]));
    agentOptions = { ...agentOptions, host: status.api_url, rootKey: Uint8Array.from(Buffer.from(status.root_key, "hex")) };
  } else {
    agentOptions = { ...agentOptions, host: "https://icp-api.io" };
  }
  const agent = await HttpAgent.create(agentOptions);
  const ids = Object.fromEntries(canisterNames.map((n) => [n, canisterId(n, environment)]));
  return { agent, identity, principal: identity.getPrincipal(), identityName: name, ids };
}

/**
 * Makes `principal` the canister's app-level admin. The first call must come
 * from a controller (the deploying identity); later calls succeed only for
 * the current admin, so "Unauthorized" means someone else already holds it.
 */
export async function ensureAdmin(name, actor, principal) {
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
