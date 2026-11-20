// Imports the NCAA men's basketball and football rule books into the content
// and exam canisters, word for word: an article per rule, each rule's
// approved rulings as casebook plays, the season's rule changes and points
// of emphasis, and a certification exam template per sport. Questions are
// not imported: admins make them from the imported rules with the scenario
// generator.
//
// The repository holds no NCAA text. This downloads the NCAA's PDFs, checks
// each against the edition pinned in ncaa/editions.mjs, extracts the text
// with poppler's pdftotext, checks the extraction word for word, and only
// then writes to the canisters. Any difference, unsettled line-end hyphen
// or new edition stops it before anything is written. Re-running is safe:
// every write replaces or updates in place.
//
// Usage: node scripts/seed-ncaa.mjs [environment] [--sport <id>] [--books <dir>] [--dry-run]
//   environment  local | staging | ic (default local)
//   --sport      import one sport (ncaa_basketball or ncaa_football)
//   --books      read the PDFs from this folder (as named in editions.mjs)
//                instead of downloading them
//   --dry-run    download, extract and check, then stop
// Needs pdftotext (poppler-utils). Runs as the active icp identity.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Actor } from "@icp-sdk/core/agent";
import { connect, ensureAdmin, environmentFromArgs } from "./lib/icp.mjs";
import { idlFactory as contentIdl } from "../src/declarations/content/index.ts";
import { idlFactory as examIdl } from "../src/declarations/exam/index.ts";
import { parseBbox, stripRunning } from "./ncaa/text.mjs";
import { BASKETBALL_LAYOUT, checkCaseBook, checkRulesBook, parseCaseBook, parseRulesBook } from "./ncaa/basketball.mjs";
import { FOOTBALL_LAYOUT, checkFootballBook, parseFootballBook } from "./ncaa/football.mjs";
import { buildBasketball, buildFootball, checkEdition } from "./ncaa/import.mjs";
import { EDITIONS, LEVELS } from "./ncaa/editions.mjs";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const NETWORK = environmentFromArgs(args.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--sport", "--books"].includes(args[i - 1]))));
const ONLY = flag("--sport");
const BOOKS = flag("--books");
const DRY_RUN = args.includes("--dry-run");
const OVERRIDES = JSON.parse(readFileSync(new URL("./ncaa/hyphenation.json", import.meta.url), "utf8"));

async function fetchBook(book, work) {
  const name = basename(new URL(book.url).pathname);
  let bytes;
  if (BOOKS) bytes = readFileSync(join(BOOKS, name));
  else {
    const res = await fetch(book.url);
    if (!res.ok) throw new Error(`${book.title}: download failed (${res.status}) from ${book.url}`);
    bytes = Buffer.from(await res.arrayBuffer());
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== book.sha256) {
    throw new Error(`${book.title}: the NCAA's file has changed (sha256 ${sha}). Review the new edition (the checks must pass and its hyphens be settled), then pin it in scripts/ncaa/editions.mjs.`);
  }
  const pdf = join(work, name);
  writeFileSync(pdf, bytes);
  return pdf;
}

/** pdftotext's outputs for one book: the words with their positions, and an independent plain extraction. */
function extract(pdf, plainMode) {
  execFileSync("pdftotext", ["-bbox-layout", pdf, `${pdf}.html`]);
  execFileSync("pdftotext", [...(plainMode ? [plainMode] : []), pdf, `${pdf}.txt`]);
  return { pages: parseBbox(readFileSync(`${pdf}.html`, "utf8")), plain: readFileSync(`${pdf}.txt`, "utf8") };
}

async function readEdition(edition, work) {
  const edn = { sportId: edition.sportId, season: edition.season, source: edition.books.rules.title };
  if (edition.sportId === "ncaa_basketball") {
    const r = extract(await fetchBook(edition.books.rules, work));
    const c = extract(await fetchBook(edition.books.caseBook, work));
    const rulesBook = parseRulesBook(stripRunning(r.pages, BASKETBALL_LAYOUT), { overrides: OVERRIDES });
    const caseBook = parseCaseBook(stripRunning(c.pages, BASKETBALL_LAYOUT), { overrides: OVERRIDES });
    const built = buildBasketball(edn, rulesBook, caseBook);
    const problems = checkEdition(edition.displayName, {
      rules: rulesBook.rules, plays: built.plays,
      failed: [...checkRulesBook(rulesBook, r.plain), ...checkCaseBook(caseBook, c.plain)],
      unresolved: [...rulesBook.report.unresolved, ...caseBook.report.unresolved],
    });
    return { built, problems };
  }
  const f = extract(await fetchBook(edition.books.rules, work), "-layout");
  const book = parseFootballBook(stripRunning(f.pages, FOOTBALL_LAYOUT), { overrides: OVERRIDES });
  const built = buildFootball(edn, book);
  const problems = checkEdition(edition.displayName, {
    rules: book.rules, plays: built.plays, failed: checkFootballBook(book, f.plain), unresolved: book.report.unresolved,
  });
  return { built, problems };
}

function unwrap(what, res) {
  if ("err" in res) throw new Error(`${what}: ${typeof res.err === "string" ? res.err : JSON.stringify(res.err)}`);
  return res.ok;
}

async function write(edition, built, content, exam) {
  const { sportId, season } = edition;
  unwrap(`sport ${sportId}`, await content.upsertSport({ id: sportId, displayName: edition.displayName, rulebookYear: edition.rulebookYear, levels: LEVELS }));

  for (const a of built.articles) {
    unwrap(`Rule ${a.number}`, await content.upsertArticle({ ...a, number: BigInt(a.number) }));
  }
  let plays = { added: 0n, updated: 0n, removed: 0n };
  for (const [articleId, items] of Object.entries(built.plays)) {
    const r = unwrap(`plays for ${articleId}`, await content.replacePlays(articleId, items));
    plays = { added: plays.added + r.added, updated: plays.updated + r.updated, removed: plays.removed + r.removed };
  }

  // Rule changes: update the ones this edition already wrote (same
  // citation and title), add the rest, and remove this edition's that it
  // no longer lists. Changes an admin entered by hand are left alone.
  const existing = await content.listRuleChanges(sportId, season);
  const kept = new Set();
  for (const c of built.ruleChanges) {
    const match = existing.find((e) => e.citation === c.citation && e.title === c.title && !kept.has(e.id));
    const saved = unwrap(`rule change ${c.citation}`, await content.upsertRuleChange(match ? [match.id] : [], c));
    kept.add(saved.id);
  }
  for (const e of existing) {
    if (e.source === edition.books.rules.title && !kept.has(e.id)) unwrap(`rule change ${e.citation}`, await content.deleteRuleChange(e.id));
  }

  const poes = unwrap("points of emphasis", await content.replacePointsOfEmphasis(sportId, season, built.emphasis));

  // upsertExamTemplate mints a new template each call: add one only if
  // the sport has none by this name.
  const templates = await exam.listExamTemplates(sportId);
  if (!templates.some((t) => t.name === edition.examName)) {
    unwrap("exam template", await exam.upsertExamTemplate({
      name: edition.examName, sportId, questionCount: 100n, timeLimitSec: 5400n, casebookRatioPct: 40n, passThresholdPct: 75n,
      articleWeights: built.articles.map((a) => [`${sportId}:art${a.number}`, 1n]),
    }));
  }

  console.log(`  ✓ ${edition.displayName}: ${built.articles.length} rules; plays ${plays.added} added, ${plays.updated} updated, ${plays.removed} removed; ${built.ruleChanges.length} rule changes; points of emphasis ${poes.added} added, ${poes.updated} updated, ${poes.removed} removed`);
}

async function main() {
  const editions = EDITIONS.filter((e) => !ONLY || e.sportId === ONLY);
  if (editions.length === 0) throw new Error(`No edition for sport "${ONLY}" (have: ${EDITIONS.map((e) => e.sportId).join(", ")})`);

  // Everything is read and checked before anything is written.
  const work = mkdtempSync(join(tmpdir(), "ncaa-"));
  const read = [];
  try {
    for (const e of editions) {
      console.log(`Reading ${e.displayName} …`);
      const r = await readEdition(e, work);
      const plays = Object.values(r.built.plays).reduce((n, p) => n + p.length, 0);
      console.log(`  ${r.built.articles.length} rules, ${plays} approved rulings, ${r.built.ruleChanges.length} rule changes, ${r.built.emphasis.length} points of emphasis`);
      read.push({ edition: e, ...r });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const problems = read.flatMap((r) => r.problems);
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    throw new Error("Nothing was written: the import is refused until these are fixed.");
  }
  console.log("Every passage matches the books word for word.");
  if (DRY_RUN) return;

  const { agent, principal, ids } = await connect(NETWORK, ["content", "exam"]);
  const content = Actor.createActor(contentIdl, { agent, canisterId: ids.content });
  const exam = Actor.createActor(examIdl, { agent, canisterId: ids.exam });
  console.log(`Writing as ${principal.toText()} on "${NETWORK}"`);
  await ensureAdmin("content", content, principal);
  await ensureAdmin("exam", exam, principal);
  for (const r of read) await write(r.edition, r.built, content, exam);
  console.log("Done. Make questions from the imported rules with the scenario generator.");
}

main().catch((err) => {
  console.error(`NCAA import failed: ${err.message}`);
  process.exit(1);
});
