// One-time (or whenever the key rotates) admin config for the ai_proxy
// canister's Claude integration (rule assistant + scenario generator, see
// issue #24). The Anthropic API key is read ONLY from the
// ANTHROPIC_API_KEY environment variable at run time — it is never written
// to disk, never logged, and never hardcoded — pass it inline:
//
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/set-ai-config.mjs [network]
//
// Optionally override the model with ANTHROPIC_MODEL=... (defaults to the
// canister's built-in default, "claude-sonnet-5").

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const args = process.argv.slice(2);
const NETWORK = args.find((a) => !a.startsWith("--")) ?? "local";
const IC_HOST = NETWORK === "local" ? "http://127.0.0.1:4943" : "https://ic0.app";

// Same fixed-seed identity used by seed-content.mjs / generate-audio.mjs —
// already admin on the other canisters from the initial seeding run.
const SEED_IDENTITY_SEED = new Uint8Array(32).fill(0xcd);

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

const aiProxyIdlFactory = ({ IDL: I }) => {
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  return I.Service({
    setAdmin:         I.Func([I.Principal], [ResultUnit], []),
    setAnthropicKey:  I.Func([I.Text], [ResultUnit], []),
    setClaudeModel:   I.Func([I.Text], [ResultUnit], []),
  });
};

async function ensureAdmin(actor, principal) {
  const res = await actor.setAdmin(principal);
  if ("err" in res && res.err !== "Unauthorized") {
    throw new Error(`ai_proxy.setAdmin failed: ${res.err}`);
  }
  if ("err" in res) {
    console.log("  (ai_proxy admin already set to a different principal — assuming it's this identity from a prior run)");
  } else {
    console.log(`  ai_proxy admin set to ${principal.toText()}`);
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set. Run as: ANTHROPIC_API_KEY=sk-ant-... node scripts/set-ai-config.mjs");
  }
  const model = process.env.ANTHROPIC_MODEL;

  const env = readEnvFile();
  const aiProxyId = env.CANISTER_ID_AI_PROXY;
  if (!aiProxyId) {
    throw new Error("CANISTER_ID_AI_PROXY not found in .env — run `make deploy` first.");
  }

  const identity = Ed25519KeyIdentity.generate(SEED_IDENTITY_SEED);
  const principal = identity.getPrincipal();
  const agent = new HttpAgent({ host: IC_HOST, identity });
  if (NETWORK === "local") await agent.fetchRootKey();

  const aiProxy = Actor.createActor(aiProxyIdlFactory, { agent, canisterId: aiProxyId });

  console.log(`Configuring ai_proxy as principal ${principal.toText()} on network "${NETWORK}"`);
  await ensureAdmin(aiProxy, principal);

  const keyRes = await aiProxy.setAnthropicKey(apiKey);
  if ("err" in keyRes) throw new Error(`setAnthropicKey failed: ${keyRes.err}`);
  console.log("  ✓ Anthropic API key configured");

  if (model) {
    const modelRes = await aiProxy.setClaudeModel(model);
    if ("err" in modelRes) throw new Error(`setClaudeModel failed: ${modelRes.err}`);
    console.log(`  ✓ Claude model set to ${model}`);
  }

  console.log("");
  console.log("Done. The rule assistant and scenario generator are now live.");
}

main().catch((err) => {
  console.error("AI config failed:", err);
  process.exit(1);
});
