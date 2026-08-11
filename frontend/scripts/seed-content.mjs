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
import { ARTICLES, SPORT_ID, LEVEL_ID, POINTS_OF_EMPHASIS, MECHANICS_ARTICLE_ID, MECHANICS_QUESTIONS, MECHANICS_SCENARIOS } from "./seedData.mjs";

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
  const DiagramPlayer = I.Record({ id: I.Text, x: I.Nat, y: I.Nat, shortLabel: I.Text, role: I.Text });
  const DiagramArrow = I.Record({ fromId: I.Text, toId: I.Text, style: I.Text });
  const Diagram = I.Record({ players: I.Vec(DiagramPlayer), arrows: I.Vec(DiagramArrow) });
  const PlayInput = I.Record({ articleId: I.Text, citation: I.Text, scenario: I.Text, ruling: I.Text, diagram: I.Opt(Diagram) });
  const CasebookPlay = I.Record({
    id: I.Text, articleId: I.Text, citation: I.Text, scenario: I.Text, ruling: I.Text,
    audioUrl: I.Opt(I.Text), diagram: I.Opt(Diagram), videoUrl: I.Opt(I.Text),
  });
  const PoeInput = I.Record({ season: I.Text, title: I.Text, body: I.Text, linkedArticleIds: I.Vec(I.Text) });
  const Poe = I.Record({
    id: I.Text, season: I.Text, title: I.Text, body: I.Text,
    linkedArticleIds: I.Vec(I.Text), audioUrl: I.Opt(I.Text), createdAt: I.Int,
  });
  const MechanicsZone = I.Record({
    id: I.Text, x: I.Nat, y: I.Nat, width: I.Nat, height: I.Nat, correctOfficial: I.Text,
  });
  const ScenarioInput = I.Record({
    crewSize: I.Nat, title: I.Text, description: I.Text,
    players: I.Vec(DiagramPlayer), zones: I.Vec(MechanicsZone),
  });
  const Scenario = I.Record({
    id: I.Text, crewSize: I.Nat, title: I.Text, description: I.Text,
    players: I.Vec(DiagramPlayer), zones: I.Vec(MechanicsZone), createdAt: I.Int,
  });
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  const ResultArticle = I.Variant({ ok: Article, err: I.Text });
  const ResultPlay = I.Variant({ ok: CasebookPlay, err: I.Text });
  const ResultPoe = I.Variant({ ok: Poe, err: I.Text });
  const ResultScenario = I.Variant({ ok: Scenario, err: I.Text });
  return I.Service({
    setAdmin: I.Func([I.Principal], [ResultUnit], []),
    upsertArticle: I.Func([ArticleInput], [ResultArticle], []),
    upsertPlay: I.Func([PlayInput], [ResultPlay], []),
    upsertPointOfEmphasis: I.Func([PoeInput], [ResultPoe], []),
    listPointsOfEmphasis: I.Func([I.Text], [I.Vec(Poe)], ["query"]),
    upsertMechanicsScenario: I.Func([ScenarioInput], [ResultScenario], []),
    listMechanicsScenarios: I.Func([], [I.Vec(Scenario)], ["query"]),
  });
};

const examIdlFactory = ({ IDL: I }) => {
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  const Template = I.Record({
    id: I.Text, name: I.Text, sportId: I.Text, questionCount: I.Nat, timeLimitSec: I.Nat,
    casebookRatioPct: I.Nat, passThresholdPct: I.Nat,
    articleWeights: I.Vec(I.Tuple(I.Text, I.Nat)), createdAt: I.Int,
  });
  const TemplateInput = I.Record({
    name: I.Text, sportId: I.Text, questionCount: I.Nat, timeLimitSec: I.Nat,
    casebookRatioPct: I.Nat, passThresholdPct: I.Nat, articleWeights: I.Vec(I.Tuple(I.Text, I.Nat)),
  });
  const ResultTemplate = I.Variant({ ok: Template, err: I.Text });
  return I.Service({
    setAdmin: I.Func([I.Principal], [ResultUnit], []),
    upsertExamTemplate: I.Func([TemplateInput], [ResultTemplate], []),
    listExamTemplates: I.Func([I.Text], [I.Vec(Template)], ["query"]),
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
  const examId = env.CANISTER_ID_EXAM;
  if (!contentId || !questionId) {
    throw new Error("CANISTER_ID_CONTENT / CANISTER_ID_QUESTION not found in .env — run `make deploy` first.");
  }

  const identity = Ed25519KeyIdentity.generate(SEED_IDENTITY_SEED);
  const principal = identity.getPrincipal();
  const agent = new HttpAgent({ host: IC_HOST, identity });
  if (NETWORK === "local") await agent.fetchRootKey();

  const content = Actor.createActor(contentIdlFactory, { agent, canisterId: contentId });
  const question = Actor.createActor(questionIdlFactory, { agent, canisterId: questionId });
  const exam = examId ? Actor.createActor(examIdlFactory, { agent, canisterId: examId }) : null;

  console.log(`Seeding as principal ${principal.toText()} on network "${NETWORK}"`);
  await ensureAdmin("content", content, principal);
  await ensureAdmin("question", question, principal);
  if (exam) await ensureAdmin("exam", exam, principal);

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
      const diagramCandid = play.diagram
        ? [{
            players: play.diagram.players.map(p => ({ ...p, x: BigInt(p.x), y: BigInt(p.y) })),
            arrows: play.diagram.arrows,
          }]
        : [];
      const playRes = await content.upsertPlay({
        articleId, citation: play.citation, scenario: play.scenario, ruling: play.ruling,
        diagram: diagramCandid,
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

  // Mechanics questions live under one pseudo-article bucket rather than a
  // real content Article, so they're seeded straight to the question
  // canister without an upsertArticle call first (see seedData.mjs).
  let mechanicsQuestionCount = 0;
  for (const q of MECHANICS_QUESTIONS) {
    const qRes = await question.addQuestion({
      sportId: SPORT_ID, articleId: MECHANICS_ARTICLE_ID, citation: q.citation,
      stem: q.stem, choices: q.choices, correctId: q.correctId,
      explanation: q.explanation, difficulty: toDifficultyVariant(q.difficulty),
      isCasebook: q.isCasebook, isPointOfEmphasis: q.isPointOfEmphasis,
    });
    if ("err" in qRes) {
      console.error(`  ✗ mechanics question "${q.stem.slice(0, 40)}...": ${qRes.err}`);
      errorCount++;
    } else {
      mechanicsQuestionCount++;
    }
  }
  console.log(`  ✓ Mechanics questions seeded: ${mechanicsQuestionCount}`);

  // upsertMechanicsScenario always mints a fresh id — skip titles already
  // seeded to keep re-running this script idempotent.
  let scenarioCount = 0;
  const existingScenarios = await content.listMechanicsScenarios();
  const existingScenarioTitles = new Set(existingScenarios.map(s => s.title));
  for (const s of MECHANICS_SCENARIOS) {
    if (existingScenarioTitles.has(s.title)) {
      console.log(`  · Mechanics scenario "${s.title}" already seeded — skipping`);
      scenarioCount++;
      continue;
    }
    const players = s.players.map(p => ({ ...p, x: BigInt(p.x), y: BigInt(p.y) }));
    const zones = s.zones.map(z => ({ ...z, x: BigInt(z.x), y: BigInt(z.y), width: BigInt(z.width), height: BigInt(z.height) }));
    const sRes = await content.upsertMechanicsScenario({
      crewSize: BigInt(s.crewSize), title: s.title, description: s.description, players, zones,
    });
    if ("err" in sRes) {
      console.error(`  ✗ Mechanics scenario "${s.title}": ${sRes.err}`);
      errorCount++;
    } else {
      scenarioCount++;
      console.log(`  ✓ Mechanics scenario "${sRes.ok.title}" -> ${sRes.ok.id}`);
    }
  }

  let examTemplateCount = 0;
  if (exam) {
    // upsertExamTemplate also mints a fresh id each call — skip if a
    // template with this name already exists for the sport.
    const existingTemplates = await exam.listExamTemplates(SPORT_ID);
    const already = existingTemplates.some(t => t.name === "NCAA Men's Basketball Certification Exam");
    if (already) {
      console.log(`  · Exam template "NCAA Men's Basketball Certification Exam" already seeded — skipping`);
      examTemplateCount++;
    } else {
      const articleWeights = ARTICLES.map(a => [`${SPORT_ID}:art${a.number}`, 1n]);
      const templateRes = await exam.upsertExamTemplate({
        name: "NCAA Men's Basketball Certification Exam",
        sportId: SPORT_ID,
        questionCount: 100n,
        timeLimitSec: 5400n, // 90 minutes
        casebookRatioPct: 40n,
        passThresholdPct: 75n,
        articleWeights,
      });
      if ("err" in templateRes) {
        console.error(`  ✗ Exam template: ${templateRes.err}`);
        errorCount++;
      } else {
        examTemplateCount++;
        console.log(`  ✓ Exam template "${templateRes.ok.name}" -> ${templateRes.ok.id}`);
      }
    }
  }

  console.log("");
  console.log(`Done. Articles: ${articleCount}, casebook plays: ${playCount}, questions: ${questionCount}, mechanics questions: ${mechanicsQuestionCount}, mechanics scenarios: ${scenarioCount}, points of emphasis: ${poeCount}, exam templates: ${examTemplateCount}, errors: ${errorCount}`);
  if (errorCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
