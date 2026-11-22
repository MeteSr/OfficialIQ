import { test, expect, en, signUp, ensureSignedUp, navTab } from "../support/fixtures";
import { playQuiz } from "../support/quiz";
import { BASKETBALL, RULE_QUESTIONS, CASEBOOK_QUESTIONS, articleTitle, playCitation, playScenario, playRuling } from "../support/seed";

// Manual test plan cases 4, 5 and 21: opening a rule from Study, answering
// its quiz, and reporting a question an admin then resolves.

const QUESTIONS_PER_ARTICLE = RULE_QUESTIONS + CASEBOOK_QUESTIONS;

test("case 4: an article opens from Study and its casebook plays show with their questions", async ({ newOfficial }) => {
  const o = await newOfficial();
  await signUp(o);
  await navTab(o.page, "study").click();
  await o.page.getByText(articleTitle(BASKETBALL, 2)).click();
  await expect(o.page).toHaveURL(/\/quiz\/ncaa_basketball:art2/);

  let sawPlay = false;
  await playQuiz(o.page, {
    onQuestion: async () => {
      const play = o.page.getByText(`${en.quiz.casebook} · ${playCitation(2)}`);
      if (!(await play.isVisible())) return;
      sawPlay = true;
      await expect(o.page.getByText(playScenario(BASKETBALL, 2))).toBeVisible();
      await expect(o.page.getByText(playRuling(BASKETBALL, 2))).toBeVisible();
    },
  });
  expect(sawPlay).toBe(true);
});

test("case 5: every answer in an article quiz is marked right or wrong with its rule", async ({ newOfficial }) => {
  const o = await newOfficial();
  await signUp(o);
  await o.page.goto(`/quiz/${BASKETBALL.id}:art3?adaptive=1`);

  // Right on even questions, wrong on odd ones; playQuiz checks each one is
  // marked and its rule cited before moving on.
  const stems = await playQuiz(o.page, { correct: (i) => i % 2 === 0 });
  expect(stems).toHaveLength(QUESTIONS_PER_ARTICLE);
  const right = Math.ceil(stems.length / 2);
  await expect(o.page.getByText(`${right} / ${stems.length} correct`)).toBeVisible();
  const pct = Math.round((right / stems.length) * 100);
  await expect(o.page.getByText(`${pct}%`, { exact: true })).toBeVisible({ timeout: 30_000 });
});

test("case 21: a reported question reaches the moderation queue and can be resolved", async ({ newOfficial, admin }) => {
  const o = await newOfficial();
  await signUp(o);
  await o.page.goto(`/quiz/${BASKETBALL.id}:art1?count=5`);

  const stem = (await o.page.getByText(/E2E basketball rule 1 question \d+/).first().innerText()).trim();
  await o.page.getByRole("button", { name: /Wrong ruling one/ }).click();
  await o.page.getByRole("button", { name: en.reportQuestion.open }).click();
  await o.page.getByRole("radio", { name: en.reportQuestion.reasonWrongAnswer }).click();
  const note = `E2E report from ${o.name}`;
  await o.page.getByPlaceholder(en.reportQuestion.notePlaceholder).fill(note);
  await o.page.getByRole("button", { name: en.reportQuestion.send }).click();
  await expect(o.page.getByText(en.reportQuestion.thanks)).toBeVisible();

  const a = await admin();
  await ensureSignedUp(a);
  await a.page.getByRole("button", { name: en.me.moderationQueue }).click();
  await expect(a.page.getByText(en.moderation.title)).toBeVisible();
  const report = a.page.locator("div").filter({ hasText: note }).filter({ has: a.page.getByRole("button", { name: en.moderation.markResolved }) }).last();
  await expect(report).toBeVisible();
  await expect(report.getByText(stem)).toBeVisible();
  await report.getByPlaceholder(en.moderation.resolutionPlaceholder).fill("E2E: reviewed, the keyed answer stands");
  await report.getByRole("button", { name: en.moderation.markResolved }).click();
  await expect(a.page.getByText(note)).toHaveCount(0);
});
