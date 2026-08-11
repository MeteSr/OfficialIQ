// Generates narration audio for every seeded content article via ElevenLabs
// TTS (called through the ai_proxy canister's HTTPS outcall) and stores the
// resulting audio bytes on-chain in the content canister.
//
// The ElevenLabs API key is read ONLY from the ELEVENLABS_API_KEY
// environment variable at run time. It is never written to disk, never
// logged, and never hardcoded — pass it inline:
//
//   ELEVENLABS_API_KEY=sk_... node scripts/generate-audio.mjs [network] [--force]
//
// Skips articles that already have stored audio unless --force is passed.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { ARTICLES, SPORT_ID, LEVEL_ID } from "./seedData.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const NETWORK = args.find((a) => !a.startsWith("--")) ?? "local";
const IC_HOST = NETWORK === "local" ? "http://127.0.0.1:4943" : "https://ic0.app";

const ELEVENLABS_VOICE_ID = "onwK4e9ZLuTAKqWW03F9"; // "Daniel" — premade voice, accessible on free-tier API keys
const ELEVENLABS_MODEL_ID = "eleven_turbo_v2_5";
const MAX_RESPONSE_BYTES = 1_800_000n; // stays under the IC's 2MB http-outcall cap
const HTTP_OUTCALL_CYCLES = 30_000_000_000n; // comfortably covers the fee for MAX_RESPONSE_BYTES

// Same fixed-seed identity used by seed-content.mjs — already admin on
// content/question from the initial seeding run.
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

const contentIdlFactory = ({ IDL: I }) => {
  const Article = I.Record({
    id: I.Text, sportId: I.Text, levelId: I.Text, number: I.Nat, title: I.Text, body: I.Text,
    audioUrl: I.Opt(I.Text), createdAt: I.Int, updatedAt: I.Int,
  });
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  return I.Service({
    setAdmin: I.Func([I.Principal], [ResultUnit], []),
    listArticles: I.Func([I.Text, I.Text], [I.Vec(Article)], ["query"]),
    getArticleAudio: I.Func([I.Text], [I.Opt(I.Vec(I.Nat8))], ["query"]),
    setArticleAudio: I.Func([I.Text, I.Vec(I.Nat8)], [ResultUnit], []),
  });
};

const aiProxyIdlFactory = ({ IDL: I }) => {
  const HttpHeader = I.Record({ name: I.Text, value: I.Text });
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  const ResultBlob = I.Variant({ ok: I.Vec(I.Nat8), err: I.Text });
  return I.Service({
    setAdmin: I.Func([I.Principal], [ResultUnit], []),
    httpPost: I.Func([I.Text, I.Vec(HttpHeader), I.Text, I.Nat64, I.Nat], [ResultBlob], []),
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
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is not set. Run as: ELEVENLABS_API_KEY=sk_... node scripts/generate-audio.mjs");
  }

  const env = readEnvFile();
  const contentId = env.CANISTER_ID_CONTENT;
  const aiProxyId = env.CANISTER_ID_AI_PROXY;
  if (!contentId || !aiProxyId) {
    throw new Error("CANISTER_ID_CONTENT / CANISTER_ID_AI_PROXY not found in .env — run `make deploy` first.");
  }

  const identity = Ed25519KeyIdentity.generate(SEED_IDENTITY_SEED);
  const principal = identity.getPrincipal();
  const agent = new HttpAgent({ host: IC_HOST, identity });
  if (NETWORK === "local") await agent.fetchRootKey();

  const content = Actor.createActor(contentIdlFactory, { agent, canisterId: contentId });
  const aiProxy = Actor.createActor(aiProxyIdlFactory, { agent, canisterId: aiProxyId });

  console.log(`Generating audio as principal ${principal.toText()} on network "${NETWORK}"`);
  await ensureAdmin("content", content, principal);
  await ensureAdmin("ai_proxy", aiProxy, principal);

  const remoteArticles = await content.listArticles(SPORT_ID, LEVEL_ID);
  const remoteById = new Map(remoteArticles.map((a) => [a.number, a]));

  let generated = 0, skipped = 0, errorCount = 0;

  for (const article of ARTICLES) {
    const remote = remoteById.get(BigInt(article.number));
    if (!remote) {
      console.error(`  ✗ Art. ${article.number}: not found in content canister — run seed-content first`);
      errorCount++;
      continue;
    }

    if (!FORCE) {
      const existing = await content.getArticleAudio(remote.id);
      if (existing.length > 0) {
        console.log(`  · Art. ${article.number} "${article.title}" already has audio — skipping`);
        skipped++;
        continue;
      }
    }

    const text = `${article.title}. ${article.body}`.slice(0, 4500);
    const bodyJson = JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });

    try {
      const res = await aiProxy.httpPost(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        [
          { name: "xi-api-key", value: apiKey },
          { name: "Content-Type", value: "application/json" },
          { name: "Accept", value: "audio/mpeg" },
        ],
        bodyJson,
        MAX_RESPONSE_BYTES,
        HTTP_OUTCALL_CYCLES,
      );
      if ("err" in res) {
        console.error(`  ✗ Art. ${article.number} TTS request: ${res.err}`);
        errorCount++;
        continue;
      }

      const audioBytes = res.ok;
      const storeRes = await content.setArticleAudio(remote.id, audioBytes);
      if ("err" in storeRes) {
        console.error(`  ✗ Art. ${article.number} setArticleAudio: ${storeRes.err}`);
        errorCount++;
        continue;
      }

      console.log(`  ✓ Art. ${article.number} "${article.title}" -> ${audioBytes.length} bytes stored`);
      generated++;
    } catch (err) {
      console.error(`  ✗ Art. ${article.number} failed: ${err.message ?? err}`);
      errorCount++;
    }
  }

  console.log("");
  console.log(`Done. Generated: ${generated}, skipped: ${skipped}, errors: ${errorCount}`);
  if (errorCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Audio generation failed:", err);
  process.exit(1);
});
