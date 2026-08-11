// Seeds the content and question canisters with practice NCAA Men's Basketball
// officiating data (see seedData.mjs). Run after `make deploy` / `dfx deploy`.
//
// Usage: node scripts/seed-content.mjs [network]   (default network: local)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { ARTICLES, SPORT_ID, LEVEL_ID, POINTS_OF_EMPHASIS } from "./seedData.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const NETWORK = process.argv[2] ?? "local";
const IC_HOST = NETWORK === "local" ? "http://127.0.0.1:4943" : "https://ic0.app";

// Fixed-seed identity dedicated to seeding — becomes canister admin on first run.
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
  const ArticleInput = I.Record({ sportId: I.Text, levelId: I.Text, number: I.Nat, title: I.Text, body: I.Text });
  const Article = I.Record({
    id: I.Text, sportId: I.Text, levelId: I.Text, number: I.Nat, title: I.Text, body: I.Text,
    audioUrl: I.Opt(I.Text), createdAt: I.Int, updatedAt: I.Int,
  });
  const PlayInput = I.Record({ articleId: I.Text, citation: I.Text, scenario: I.Text, ruling: I.Text });
  const CasebookPlay = I.Record({
    id: I.Text, articleId: I.Text, citation: I.Text, scenario: I.Text, ruling: I.Text, audioUrl: I.Opt(I.Text),
  });
  const PoeInput = I.Record({ season: I.Text, title: I.Text, body: I.Text, linkedArticleIds: I.Vec(I.Text) });
  const Poe = I.Record({
    id: I.Text, season: I.Text, title: I.Text, body: I.Text,
    linkedArticleIds: I.Vec(I.Text), audioUrl: I.Opt(I.Text), createdAt: I.Int,
  });
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  const ResultArticle = I.Variant({ ok: Article, err: I.Text });
  const ResultPlay = I.Variant({ ok: CasebookPlay, err: I.Text });
  const ResultPoe = I.Variant({ ok: Poe, err: I.Text });
  return I.Service({
    setAdmin: I.Func([I.Principal], [ResultUnit], []),
    upsertArticle: I.Func([ArticleInput], [ResultArticle], []),
    upsertPlay: I.Func([PlayInput], [ResultPlay], []),
    upsertPointOfEmphasis: I.Func([PoeInput], [ResultPoe], []),
    listPointsOfEmphasis: I.Func([I.Text], [I.Vec(Poe)], ["query"]),
  });
};

const questionIdlFactory = ({ IDL: I }) => {
  const Choice = I.Record({ id: I.Text, text: I.Text });
  const Difficulty = I.Variant({ Beginner: I.Null, Intermediate: I.Null, Advanced: I.Null, Expert: I.Null });
  const QuestionInput = I.Record({
    sportId: I.Text, articleId: I.Text, citation: I.Text, stem: I.Text,
    choices: I.Vec(Choice), correctId: I.Text, explanation: I.Text,
    difficulty: Difficulty, isCasebook: I.Bool, isPointOfEmphasis: I.Bool,
  });
  const Question = I.Record({
    id: I.Text, sportId: I.Text, articleId: I.Text, citation: I.Text, stem: I.Text,
    choices: I.Vec(Choice), correctId: I.Text, explanation: I.Text,
    difficulty: Difficulty, isCasebook: I.Bool, isPointOfEmphasis: I.Bool, createdAt: I.Int,
  });
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  const ResultQuestion = I.Variant({ ok: Question, err: I.Text });
  return I.Service({
    setAdmin: I.Func([I.Principal], [ResultUnit], []),
    addQuestion: I.Func([QuestionInput], [ResultQuestion], []),
  });
};

function toDifficultyVariant(name) {
  return { [name]: null };
}

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
  const env = readEnvFile();
  const contentId = env.CANISTER_ID_CONTENT;
  const questionId = env.CANISTER_ID_QUESTION;
  if (!contentId || !questionId) {
    throw new Error("CANISTER_ID_CONTENT / CANISTER_ID_QUESTION not found in .env — run `make deploy` first.");
  }

  const identity = Ed25519KeyIdentity.generate(SEED_IDENTITY_SEED);
  const principal = identity.getPrincipal();
  const agent = new HttpAgent({ host: IC_HOST, identity });
  if (NETWORK === "local") await agent.fetchRootKey();

  const content = Actor.createActor(contentIdlFactory, { agent, canisterId: contentId });
  const question = Actor.createActor(questionIdlFactory, { agent, canisterId: questionId });

  console.log(`Seeding as principal ${principal.toText()} on network "${NETWORK}"`);
  await ensureAdmin("content", content, principal);
  await ensureAdmin("question", question, principal);

  let articleCount = 0, playCount = 0, questionCount = 0, errorCount = 0;

  for (const article of ARTICLES) {
    const articleRes = await content.upsertArticle({
      sportId: SPORT_ID, levelId: LEVEL_ID, number: BigInt(article.number),
      title: article.title, body: article.body,
    });
    if ("err" in articleRes) {
      console.error(`  ✗ Art. ${article.number} upsertArticle: ${articleRes.err}`);
      errorCount++;
      continue;
    }
    const articleId = articleRes.ok.id;
    articleCount++;
    console.log(`  ✓ Art. ${article.number} "${article.title}" -> ${articleId}`);

    for (const play of article.plays) {
      const playRes = await content.upsertPlay({
        articleId, citation: play.citation, scenario: play.scenario, ruling: play.ruling,
      });
      if ("err" in playRes) {
        console.error(`    ✗ play "${play.citation}": ${playRes.err}`);
        errorCount++;
      } else {
        playCount++;
      }
    }

    for (const q of article.questions) {
      const citation = q.citation ?? `Art. ${article.number}`;
      const qRes = await question.addQuestion({
        sportId: SPORT_ID, articleId, citation,
        stem: q.stem, choices: q.choices, correctId: q.correctId,
        explanation: q.explanation, difficulty: toDifficultyVariant(q.difficulty),
        isCasebook: q.isCasebook, isPointOfEmphasis: q.isPointOfEmphasis,
      });
      if ("err" in qRes) {
        console.error(`    ✗ question "${q.stem.slice(0, 40)}...": ${qRes.err}`);
        errorCount++;
      } else {
        questionCount++;
      }
    }
  }

  // upsertPointOfEmphasis always mints a fresh id (unlike articles/plays,
  // which are keyed deterministically), so skip titles that already exist
  // for the season to keep re-running this script idempotent.
  let poeCount = 0;
  const existingPoes = await content.listPointsOfEmphasis(POINTS_OF_EMPHASIS[0]?.season ?? "");
  const existingTitles = new Set(existingPoes.map(p => p.title));
  for (const poe of POINTS_OF_EMPHASIS) {
    if (existingTitles.has(poe.title)) {
      console.log(`  · POE "${poe.title}" already seeded — skipping`);
      poeCount++;
      continue;
    }
    const poeRes = await content.upsertPointOfEmphasis({
      season: poe.season, title: poe.title, body: poe.body, linkedArticleIds: poe.linkedArticleIds,
    });
    if ("err" in poeRes) {
      console.error(`  ✗ POE "${poe.title}": ${poeRes.err}`);
      errorCount++;
    } else {
      poeCount++;
      console.log(`  ✓ POE "${poe.title}" -> ${poeRes.ok.id}`);
    }
  }

  console.log("");
  console.log(`Done. Articles: ${articleCount}, casebook plays: ${playCount}, questions: ${questionCount}, points of emphasis: ${poeCount}, errors: ${errorCount}`);
  if (errorCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
