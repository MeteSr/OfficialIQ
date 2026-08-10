import { ARTICLES } from "./seedData.mjs";

let errors = 0;
let totalQuestions = 0;
let totalCasebook = 0;
let totalPlays = 0;

for (const art of ARTICLES) {
  if (!art.number || !art.title || !art.body) {
    console.error(`Article missing number/title/body: ${JSON.stringify(art).slice(0, 80)}`);
    errors++;
  }
  if (art.plays.length < 1) {
    console.error(`Article ${art.number} has no casebook plays`);
    errors++;
  }
  totalPlays += art.plays.length;

  if (art.questions.length < 10) {
    console.error(`Article ${art.number} has only ${art.questions.length} questions (want >= 10)`);
    errors++;
  }

  art.questions.forEach((question, i) => {
    totalQuestions++;
    if (question.isCasebook) totalCasebook++;

    const ids = question.choices.map((c) => c.id);
    if (ids.length !== 4) {
      console.error(`Art ${art.number} Q${i}: expected 4 choices, got ${ids.length}`);
      errors++;
    }
    if (new Set(ids).size !== ids.length) {
      console.error(`Art ${art.number} Q${i}: duplicate choice ids ${ids}`);
      errors++;
    }
    if (!ids.includes(question.correctId)) {
      console.error(`Art ${art.number} Q${i}: correctId "${question.correctId}" not among choice ids ${ids} — stem: "${question.stem}"`);
      errors++;
    }
    if (!question.stem || !question.explanation) {
      console.error(`Art ${art.number} Q${i}: missing stem or explanation`);
      errors++;
    }
    if (question.isCasebook && !question.citation) {
      console.error(`Art ${art.number} Q${i}: isCasebook true but no citation`);
      errors++;
    }
  });
}

console.log(`Articles: ${ARTICLES.length}`);
console.log(`Casebook plays: ${totalPlays}`);
console.log(`Questions: ${totalQuestions} (casebook: ${totalCasebook}, non-casebook: ${totalQuestions - totalCasebook})`);
console.log(errors === 0 ? "VALIDATION OK" : `VALIDATION FAILED: ${errors} error(s)`);
process.exit(errors === 0 ? 0 : 1);
