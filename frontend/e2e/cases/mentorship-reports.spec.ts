import { test, expect, en, signUp } from "../support/fixtures";
import { playQuiz } from "../support/quiz";
import { BASKETBALL } from "../support/seed";

// Manual test plan cases 18 and 19: sharing exam answers with a mentor, and
// a public report card.

test("case 18: a mentor sees a shared exam's answers and the official sees the mentor's notes", async ({ newOfficial }) => {
  const official = await newOfficial();
  const mentor = await newOfficial();
  await signUp(official);
  await signUp(mentor);

  await official.page.goto(`/quiz/${BASKETBALL.id}:art3?count=5`);
  await playQuiz(official.page, { correct: (i) => i !== 0 });
  await official.page.getByRole("button", { name: en.shareMentor.share }).click();
  await expect(official.page.getByText(new RegExp(`${en.shareMentor.linkCopied}|${en.shareMentor.linkReady}`))).toBeVisible({ timeout: 30_000 });

  // The share link, as the official finds it again under Mentorship.
  await official.page.getByRole("button", { name: en.shareMentor.manage }).click();
  await expect(official.page.getByText(en.mentor.iveShared)).toBeVisible();
  await official.page.getByRole("button", { name: /80%/ }).click();
  await expect(official.page).toHaveURL(/\/mentor\/[^/]+$/);
  const shareUrl = new URL(official.page.url()).pathname;

  await mentor.page.goto(shareUrl);
  await expect(mentor.page.getByText(en.mentorReport.missedQuestions.replace("{{count}}", "1"))).toBeVisible({ timeout: 30_000 });
  await expect(mentor.page.getByText(/E2E basketball rule 3 question \d+/)).toBeVisible();
  const note = `E2E mentor note ${Date.now() % 100000}: review rule 3`;
  await mentor.page.getByPlaceholder(en.mentorReport.notePlaceholder).fill(note);
  await mentor.page.getByRole("button", { name: en.mentorReport.note, exact: true }).click();
  await expect(mentor.page.getByText(note)).toBeVisible();

  await official.page.goto("/mentor");
  await expect(official.page.getByText(en.mentor.noteCount_one.replace("{{count}}", "1"), { exact: false })).toBeVisible({ timeout: 30_000 });
  await official.page.goto(shareUrl);
  await expect(official.page.getByText(note)).toBeVisible();
});

test("case 19: a public report card opens logged out with the right stats and nothing private", async ({ newOfficial, browser }, testInfo) => {
  const o = await newOfficial();
  await signUp(o, { state: "NM" });
  await o.page.goto(`/quiz/${BASKETBALL.id}:art4?count=5`);
  await playQuiz(o.page);

  await o.page.goto("/reports");
  await o.page.getByRole("button", { name: en.reportCard.generate }).click();
  await expect(o.page.getByText(en.reportCardView.examsCompleted)).toBeVisible({ timeout: 30_000 });
  await o.page.getByRole("switch", { name: en.reportCard.publicProfile }).click();
  await expect(o.page.getByRole("switch", { name: en.reportCard.publicProfile })).toHaveAttribute("aria-checked", "true");
  await o.page.getByRole("button", { name: new RegExp(en.reportCard.copyPublicLink) }).click();
  const link = await o.page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/report\/[^/]+$/);

  // A visitor who isn't signed in (?skipDevAuth turns the dev sign-in off).
  const visitor = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const page = await visitor.newPage();
    await page.goto(`${new URL(link).pathname}?skipDevAuth`);
    await expect(page.getByText(o.name, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("NCAA BASKETBALL · NM")).toBeVisible();
    await expect(page.getByText(en.reportCardView.examsCompleted)).toBeVisible();
    await expect(page.getByText("100%").first()).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(text).not.toContain(o.principal.toText());
    expect(text).not.toContain(en.me.signOut);
  } finally {
    await visitor.close();
  }
});
