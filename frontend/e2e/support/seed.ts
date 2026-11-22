import { canister, ok } from "./backend";

// The content every browser test studies from: two sports with a few rule
// articles each, casebook plays and a question bank, all of it made-up test
// text (never rulebook wording). Each question's right answer reads
// CORRECT_CHOICE, so a test can answer right or wrong on purpose without
// knowing which letter it is.

export const CORRECT_CHOICE = "Correct ruling";
export const WRONG_CHOICES = ["Wrong ruling one", "Wrong ruling two", "Wrong ruling three"];

export const BASKETBALL = { id: "ncaa_basketball", name: "NCAA Men's Basketball", articles: 4, word: "basketball" } as const;
export const FOOTBALL = { id: "ncaa_football", name: "NCAA Football", articles: 2, word: "football" } as const;
export const LEVEL = { id: "varsity", displayName: "Varsity" };

export const RULE_QUESTIONS = 12;
export const CASEBOOK_QUESTIONS = 4;

export const articleId = (sport: { id: string }, n: number) => `${sport.id}:art${n}`;
export const articleTitle = (sport: { word: string }, n: number) => `E2E ${sport.word} rule ${n}`;
export const playCitation = (n: number) => `A.R. ${n}.1`;
export const playScenario = (sport: { word: string }, n: number) => `E2E ${sport.word} play ${n}: A1 is airborne when B2 takes a legal position.`;
export const playRuling = (sport: { word: string }, n: number) => `E2E ${sport.word} ruling ${n}: no foul on B2.`;
export const questionStem = (sport: { word: string }, n: number, i: number) => `E2E ${sport.word} rule ${n} question ${i}: what is the call?`;

const LETTERS = ["a", "b", "c", "d"];

async function seedSport(sport: typeof BASKETBALL | typeof FOOTBALL): Promise<void> {
  const content = await canister("content");
  const question = await canister("question");
  ok(await content.upsertSport({ id: sport.id, displayName: sport.name, levels: [LEVEL], rulebookYear: "E2E" }));

  for (let n = 1; n <= sport.articles; n++) {
    ok(await content.upsertArticle({
      sportId: sport.id, levelId: "", number: BigInt(n), language: "en",
      title: articleTitle(sport, n), body: `E2E ${sport.word} rule ${n} text. Test data, not rulebook wording.`,
    }));
    ok(await content.upsertPlay({
      articleId: articleId(sport, n), citation: playCitation(n),
      scenario: playScenario(sport, n), ruling: playRuling(sport, n), diagram: [],
    }));
  }

  // Questions have no upsert: add the bank once per network.
  const existing = (await question.listForSync(sport.id, [], 1n)) as { questions: unknown[] };
  if (existing.questions.length > 0) return;

  for (let n = 1; n <= sport.articles; n++) {
    for (let i = 0; i < RULE_QUESTIONS + CASEBOOK_QUESTIONS; i++) {
      const isCasebook = i >= RULE_QUESTIONS;
      const correctId = LETTERS[i % 4];
      let wrong = 0;
      ok(await question.addQuestion({
        sportId: sport.id, articleId: articleId(sport, n),
        // A casebook question cites its play, which the quiz shows beside it.
        citation: isCasebook ? playCitation(n) : `Rule ${n}, Section ${i + 1}`,
        stem: questionStem(sport, n, i + 1),
        choices: LETTERS.map((id) => ({ id, text: id === correctId ? CORRECT_CHOICE : WRONG_CHOICES[wrong++] })),
        correctId, explanation: `E2E explanation for rule ${n} question ${i + 1}.`,
        difficulty: { Beginner: null }, isCasebook, isPointOfEmphasis: false,
      }));
    }
  }
}

export const CERT_EXAM = { name: "E2E Basketball Certification", questions: 10, passPct: 70 };

async function seedExamTemplate(): Promise<void> {
  const exam = await canister("exam");
  const templates = (await exam.listExamTemplates(BASKETBALL.id)) as { name: string }[];
  if (templates.some((t) => t.name === CERT_EXAM.name)) return;
  ok(await exam.upsertExamTemplate({
    name: CERT_EXAM.name, sportId: BASKETBALL.id, questionCount: BigInt(CERT_EXAM.questions),
    timeLimitSec: 900n, casebookRatioPct: 20n, passThresholdPct: BigInt(CERT_EXAM.passPct),
    articleWeights: [[articleId(BASKETBALL, 1), 1n], [articleId(BASKETBALL, 2), 1n]],
  }));
}

export async function seedContent(): Promise<void> {
  await seedSport(BASKETBALL);
  await seedSport(FOOTBALL);
  await seedExamTemplate();
}
