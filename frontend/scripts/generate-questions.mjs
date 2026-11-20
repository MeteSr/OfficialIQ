// Makes the question bank from the imported rule books (run after
// seed-ncaa): for each rule section, questions on that part of the rule,
// and for each few approved rulings, one casebook question each. Uses the
// AI proxy's scenario generator (ai_proxy.generateScenarios, so the
// Anthropic key stays in the canister) and keeps only questions that are
// complete and cite the section or ruling they were made from. Each is
// tagged with its source, so a re-run skips what is done. Admins can
// review, report and retire questions in the app as usual.
//
// Usage: node scripts/generate-questions.mjs [environment] [--sport <id>] [--max-requests <n>] [--per-section <n>] [--dry-run]
//   --max-requests  stop after this many AI requests (default 40; "all" for no limit)
//   --per-section   questions per rule section (default 5, at most 10)
//   --dry-run       count what is left to make, without asking the AI
// Runs as the active icp identity (the admin of question and ai_proxy).

import { Actor } from "@icp-sdk/core/agent";
import { connect, ensureAdmin, environmentFromArgs } from "./lib/icp.mjs";
import { idlFactory as contentIdl } from "../src/declarations/content/index.ts";
import { idlFactory as questionIdl } from "../src/declarations/question/index.ts";
import { idlFactory as aiIdl } from "../src/declarations/ai_proxy/index.ts";
import { casebookRequest, generatedTag, parseGenerated, playBatches, ruleSections, sectionRequest } from "../src/lib/questionGen.ts";
import { EDITIONS } from "./ncaa/editions.mjs";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const valued = ["--sport", "--max-requests", "--per-section"];
const NETWORK = environmentFromArgs(args.filter((a, i) => !a.startsWith("--") && !valued.includes(args[i - 1])));
const ONLY = flag("--sport");
const MAX_REQUESTS = flag("--max-requests") === "all" ? Infinity : Number(flag("--max-requests") ?? 40);
const PER_SECTION = Math.min(10, Math.max(1, Number(flag("--per-section") ?? 5)));
const DRY_RUN = args.includes("--dry-run");

/** Ids of the sources (sections, ruling batches) a sport's questions were already made from. */
async function doneSources(question, sportId) {
  const done = new Set();
  let after = [];
  for (;;) {
    const page = await question.listForSync(sportId, after, 500n);
    for (const q of page.questions) {
      for (const t of await question.getQuestionTags(q.id)) if (t.startsWith("gen:")) done.add(t);
    }
    if (page.next.length === 0) break;
    after = page.next;
  }
  return done;
}

function work(sportId, articles, playsByArticle, done) {
  const jobs = [];
  for (const a of [...articles].sort((x, y) => Number(x.number) - Number(y.number))) {
    const n = Number(a.number);
    const cites = new RegExp(`\\bRules? ${n}\\b`);
    for (const s of ruleSections(a)) {
      const tag = generatedTag(s.key);
      if (!done.has(tag)) jobs.push({ sportId, articleId: a.id, tag, label: `Rule ${n}: ${s.label}`, isCasebook: false, request: sectionRequest(s, n, PER_SECTION), citations: (c) => cites.test(c) });
    }
    const plays = [...(playsByArticle.get(a.id) ?? [])].sort((x, y) => Number(x.id.slice(1)) - Number(y.id.slice(1)));
    for (const batch of playBatches(plays, 5)) {
      const tag = generatedTag(`${a.id}:${batch[0].citation.split(" (")[0]}`);
      const allowed = new Set(batch.map((p) => p.citation));
      if (!done.has(tag)) jobs.push({ sportId, articleId: a.id, tag, label: `Rule ${n}: ${batch[0].citation.split(" (")[0]} …`, isCasebook: true, request: casebookRequest(batch), citations: (c) => allowed.has(c) });
    }
  }
  return jobs;
}

async function main() {
  const { agent, principal, ids } = await connect(NETWORK, ["content", "question", "ai_proxy"]);
  const content = Actor.createActor(contentIdl, { agent, canisterId: ids.content });
  const question = Actor.createActor(questionIdl, { agent, canisterId: ids.question });
  const ai = Actor.createActor(aiIdl, { agent, canisterId: ids.ai_proxy });
  console.log(`Running as ${principal.toText()} on "${NETWORK}"`);
  if (!DRY_RUN) {
    await ensureAdmin("question", question, principal);
    await ensureAdmin("ai_proxy", ai, principal);
    if (!(await ai.metrics()).aiConfigured) throw new Error("ai_proxy has no Anthropic key yet: run the Admin task set-ai-config first.");
  }

  let requests = 0, added = 0, dropped = 0;
  for (const e of EDITIONS.filter((x) => !ONLY || x.sportId === ONLY)) {
    const articles = await content.listArticles(e.sportId, "varsity", "en");
    if (articles.length === 0) { console.log(`  · ${e.displayName}: no rules imported yet (run seed-ncaa first)`); continue; }
    const playsByArticle = new Map(await Promise.all(articles.map(async (a) => [a.id, await content.listPlays(a.id)])));
    const jobs = work(e.sportId, articles, playsByArticle, await doneSources(question, e.sportId));
    console.log(`${e.displayName}: ${jobs.length} sections and ruling sets left (${jobs.filter((j) => !j.isCasebook).length} rule sections, ${jobs.filter((j) => j.isCasebook).length} ruling sets)`);
    if (DRY_RUN) continue;

    for (const job of jobs) {
      if (requests >= MAX_REQUESTS) break;
      requests++;
      const res = await ai.generateScenarios(job.request.instructions, job.request.context, BigInt(job.request.count));
      if ("err" in res) throw new Error(`AI request for ${job.label} failed: ${res.err}`);
      const { questions, rejected } = parseGenerated(res.ok, { citations: job.citations });
      dropped += rejected.length;
      let kept = 0;
      for (const q of questions) {
        const saved = await question.addQuestion({
          sportId: job.sportId, articleId: job.articleId, citation: q.citation, stem: q.stem, choices: q.choices,
          correctId: q.correctId, explanation: q.explanation, difficulty: { [q.difficulty]: null },
          isCasebook: job.isCasebook, isPointOfEmphasis: false,
        });
        if ("err" in saved) throw new Error(`addQuestion: ${saved.err}`);
        const tagged = await question.setQuestionTags(saved.ok.id, [job.tag]);
        if ("err" in tagged) throw new Error(`setQuestionTags: ${JSON.stringify(tagged.err)}`);
        kept++;
      }
      added += kept;
      console.log(`  ✓ ${job.label}: ${kept} kept${rejected.length ? `, ${rejected.length} dropped (${[...new Set(rejected)].join("; ")})` : ""}`);
    }
    if (requests >= MAX_REQUESTS) break;
  }
  console.log(`Done: ${requests} AI requests, ${added} questions added, ${dropped} dropped.${requests >= MAX_REQUESTS ? " Stopped at --max-requests; run again to continue." : ""}`);
}

main().catch((err) => {
  console.error(`Generating questions failed: ${err.message}`);
  process.exit(1);
});
