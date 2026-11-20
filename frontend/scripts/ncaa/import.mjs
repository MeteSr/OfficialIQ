// Turns the parsed NCAA books (basketball.mjs, football.mjs) into what the
// content canister stores: an article per rule, each rule's approved
// rulings as casebook plays, the season's rule changes and points of
// emphasis. The wording is passed through as the books have it.

/** The rule a citation is under: "Rule 9-1-3 Penalty" → 9. */
export function ruleNumberOf(citation) {
  const m = citation.match(/\bRules? (\d+)/);
  return m ? Number(m[1]) : null;
}

/** The articles a passage cites ("Rule 10.1.4", "(Rules 2-3, 4-5)"), once each, in order. */
export function citedArticles(sportId, text, ruleNumbers) {
  const known = new Set(ruleNumbers);
  const out = [];
  for (const m of text.matchAll(/\bRules? ((\d+)[-.]\d[^;)]*)/g)) {
    // Every "n-" in a run like "2-3, 4-5 and 10-1" names a rule.
    for (const r of m[1].matchAll(/(?:^|[\s,(])(\d+)[-.]\d/g)) {
      const n = Number(r[1]);
      const id = `${sportId}:art${n}`;
      if (known.has(n) && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

const LEVEL_ID = "varsity"; // as the rest of the app keys NCAA content

function articlesAndPlays(sportId, rules, plays) {
  const articles = rules.map((r) => ({ sportId, levelId: LEVEL_ID, number: r.number, title: r.title, body: r.body, language: "en" }));
  // Every rule gets a set, empty or not, so an import also clears plays a
  // rule no longer has (the practice plays, or a dropped ruling).
  const byArticle = Object.fromEntries(rules.map((r) => [`${sportId}:art${r.number}`, []]));
  for (const p of plays) {
    const articleId = `${sportId}:art${p.ruleNumber}`;
    if (!byArticle[articleId]) continue; // a ruling under a rule the book doesn't have
    byArticle[articleId].push({ articleId, citation: p.citation, scenario: p.scenario, ruling: p.ruling, diagram: [] });
  }
  return { articles, plays: byArticle };
}

function change(edition, citation, title, text) {
  const n = ruleNumberOf(citation);
  return {
    sportId: edition.sportId, season: edition.season, articleId: `${edition.sportId}:art${n}`, citation, title,
    oldText: "", newText: text, summary: "", source: edition.source,
  };
}

function emphasis(edition, items, ruleNumbers) {
  return items.map((e) => ({
    season: edition.season, title: e.title, body: e.body,
    linkedArticleIds: citedArticles(edition.sportId, `${e.title} ${e.body}`, ruleNumbers),
  }));
}

export function buildBasketball(edition, rulesBook, caseBook) {
  const numbers = rulesBook.rules.map((r) => r.number);
  return {
    ...articlesAndPlays(edition.sportId, rulesBook.rules, caseBook.plays),
    ruleChanges: rulesBook.changes.map((c) => change(edition, c.citation, c.title, c.text)),
    emphasis: emphasis(edition, rulesBook.emphasis, numbers),
  };
}

/** The rules book, and the Instant Replay Case Book's plays for Rule 12 (`replay`, optional). */
export function buildFootball(edition, book, replay = { plays: [] }) {
  const numbers = book.rules.map((r) => r.number);
  return {
    ...articlesAndPlays(edition.sportId, book.rules, [...book.plays, ...replay.plays]),
    ruleChanges: book.changes.map((c) => change(edition, c.citation, c.text, c.text)),
    emphasis: emphasis(edition, book.emphasis, numbers),
  };
}

/**
 * Why an edition can't be imported, if it can't: the word-for-word check
 * failed somewhere, a line-end hyphen isn't settled, or a part is missing.
 */
export function checkEdition(name, { rules, plays, failed, unresolved }) {
  const problems = [];
  if (failed.length) problems.push(`${name}: differs from the book's text: ${failed.join(", ")}`);
  for (const u of unresolved) problems.push(`${name}: line-end hyphen not settled: ${u.left}|${u.right} (${u.where}); review it and add it to hyphenation.json`);
  if (rules.length === 0) problems.push(`${name}: no rules found`);
  if (Object.values(plays).every((p) => p.length === 0)) problems.push(`${name}: no approved rulings found`);
  return problems;
}
