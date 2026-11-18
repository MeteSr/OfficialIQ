// One-time (or whenever the key rotates) admin config for the ai_proxy
// canister's Claude integration (rule assistant + scenario generator, see
// issue #24). The Anthropic API key is read ONLY from the
// ANTHROPIC_API_KEY environment variable at run time — it is never written
// to disk, never logged, and never hardcoded — pass it inline:
//
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/set-ai-config.mjs [environment]
//
// Use a key from a dedicated Anthropic Console workspace with a monthly spend
// limit: it is stored in the ai_proxy canister's state, which the subnet's
// node operators could read (docs/DEPLOYMENT.md, "Anthropic API key").
//
// Optionally override the model with ANTHROPIC_MODEL=... (defaults to the
// canister's built-in default, "claude-sonnet-5").

import { Actor } from "@icp-sdk/core/agent";
import { connect, ensureAdmin, environmentFromArgs } from "./lib/icp.mjs";

const NETWORK = environmentFromArgs();

const aiProxyIdlFactory = ({ IDL: I }) => {
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  return I.Service({
    setAdmin:         I.Func([I.Principal], [ResultUnit], []),
    setAnthropicKey:  I.Func([I.Text], [ResultUnit], []),
    setClaudeModel:   I.Func([I.Text], [ResultUnit], []),
  });
};

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set. Run as: ANTHROPIC_API_KEY=sk-ant-... node scripts/set-ai-config.mjs");
  }
  const model = process.env.ANTHROPIC_MODEL;

  const { agent, principal, ids } = await connect(NETWORK, ["ai_proxy"]);
  const aiProxyId = ids.ai_proxy;

  const aiProxy = Actor.createActor(aiProxyIdlFactory, { agent, canisterId: aiProxyId });

  console.log(`Configuring ai_proxy as principal ${principal.toText()} on network "${NETWORK}"`);
  await ensureAdmin("ai_proxy", aiProxy, principal);

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
