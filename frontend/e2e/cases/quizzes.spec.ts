import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect, en, signUp, navTab } from "../support/fixtures";
import { canister } from "../support/backend";
import { playQuiz, currentStem } from "../support/quiz";
import { BASKETBALL, CERT_EXAM, CORRECT_CHOICE } from "../support/seed";

// Manual test plan cases 7 to 10: ranked quizzes and the certification
// exam simulation, graded by the exam canister.

const uniqueState = () => `Q${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;

async function eloOf(principal: Parameters<Awaited<ReturnType<typeof canister>>["getStats"]>[0]): Promise<number | null> {
  const stats = (await (await canister("ranking")).getStats(principal)) as [] | [{ elo: number }];
  return stats.length ? stats[0].elo : null;
}

test("case 7: two ranked quizzes get different questions, move the rating and reach the leaderboard", async ({ newOfficial }) => {
  const o = await newOfficial();
  const state = uniqueState();
  await signUp(o, { state });

  // What Exam's Solo mode opens: a graded quiz of five questions.
  await o.page.goto(`/quiz/${BASKETBALL.id}:art1?count=5`);
  const first = await playQuiz(o.page);
  await expect.poll(() => eloOf(o.principal), { timeout: 60_000 }).not.toBeNull();
  const eloAfterFirst = (await eloOf(o.principal))!;

  await o.page.goto(`/quiz/${BASKETBALL.id}:art1?count=5`);
  const second = await playQuiz(o.page, { correct: () => false });
  expect(new Set(second)).not.toEqual(new Set(first));
  await expect.poll(() => eloOf(o.principal), { timeout: 60_000 }).not.toBe(eloAfterFirst);

  await navTab(o.page, "ranks").click();
  await o.page.getByRole("button", { name: en.ranks.tabState, exact: true }).click();
  await expect(o.page.getByText(o.name, { exact: true })).toBeVisible();
  await expect(o.page.getByText(en.ranks.youTag, { exact: true })).toBeVisible();
  const elo = String(Math.round((await eloOf(o.principal))!));
  await expect(o.page.getByText(elo, { exact: true })).toBeVisible();
});

test("case 8: leaving mid-quiz and coming back doesn't break the app", async ({ newOfficial }) => {
  const o = await newOfficial();
  await signUp(o);
  await o.page.goto(`/quiz/${BASKETBALL.id}:art2?count=5`);
  await o.page.getByRole("button", { name: CORRECT_CHOICE }).click();
  await expect(o.page.getByText(`${en.challenge.correct} —`)).toBeVisible();
  await o.page.close();

  const back = await o.context.newPage();
  const errors: string[] = [];
  back.on("pageerror", (e) => errors.push(e.message));
  await back.goto("/home");
  await expect(navTab(back, "home")).toBeVisible();
  await back.goto(`/quiz/${BASKETBALL.id}:art2?count=5`);
  // A fresh quiz starts and plays to the end.
  await playQuiz(back);
  await expect(back.getByText(en.errorBoundary.title)).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function takeCertExam(page: Page): Promise<string[]> {
  await page.goto("/exam");
  await page.getByRole("button", { name: new RegExp(en.exam.certSimTitle) }).click();
  await expect(page.getByText(CERT_EXAM.name.toUpperCase())).toBeVisible();
  await page.getByRole("button", { name: en.certExam.beginExam }).click();

  const stems: string[] = [];
  for (let i = 0; i < CERT_EXAM.questions; i++) {
    await expect(page.getByText(`QUESTION ${i + 1} OF ${CERT_EXAM.questions}`)).toBeVisible();
    stems.push(await currentStem(page));
    await page.getByRole("button", { name: CORRECT_CHOICE }).click();
    if (i < CERT_EXAM.questions - 1) await page.getByRole("button", { name: en.certExam.next }).click();
  }
  await page.getByRole("button", { name: en.certExam.finishReview }).click();
  await page.getByRole("button", { name: en.certExam.submitExam }).click();
  await expect(page.getByText(en.certExam.passedTitle)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("100%").first()).toBeVisible();
  return stems;
}

test("cases 9 and 10: a certification exam is graded and kept in history, and a retake gets other questions", async ({ newOfficial }) => {
  const o = await newOfficial();
  await signUp(o);

  const first = await takeCertExam(o.page);
  expect(new Set(first).size).toBe(CERT_EXAM.questions);

  // Exam history: the Exams count on Progress, and the exported history.
  await o.page.goto("/progress");
  const download = o.page.waitForEvent("download");
  await o.page.getByRole("button", { name: new RegExp(en.progress.exportCsv.replace(/[()]/g, "\\$&")) }).click();
  const csv = readFileSync(await (await download).path(), "utf8");
  const rows = csv.trim().split(/\r?\n/).slice(1);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain(BASKETBALL.id);
  expect(rows[0]).toContain("Certification");
  expect(rows[0]).toMatch(/\b100\b/);

  const second = await takeCertExam(o.page);
  expect(new Set(second)).not.toEqual(new Set(first));
});
