import { test, expect, en, es, signUp, navTab, goInApp } from "../support/fixtures";
import { englishLines } from "../support/english";
import { playQuiz } from "../support/quiz";
import { BASKETBALL } from "../support/seed";

// Manual test plan case 23, the part a test can judge: no English is left
// once the language is Spanish. Whether the Spanish reads well stays with a
// native speaker.

const TABS = ["home", "study", "exam", "ranks", "me"] as const;
const SCREENS = ["/progress", "/exam-sim", "/association", "/mentor", "/reports", "/groups", "/readiness", "/transcript", "/schedule", "/analytics", "/ask", "/account/delete", "/weekly-quiz", "/rule-changes"];

test("case 23: switching to Spanish leaves no English on any tab", async ({ newOfficial }) => {
  test.setTimeout(300_000);
  const o = await newOfficial();
  await signUp(o);
  // Some history, so the screens show results rather than empty states.
  await o.page.goto(`/quiz/${BASKETBALL.id}:art1?count=5`);
  await playQuiz(o.page, { correct: (i) => i > 0 });

  await o.page.goto("/me");
  await o.page.getByRole("button", { name: en.me.editProfile, exact: true }).click();
  await o.page.getByLabel(en.me.languageLabel, { exact: true }).selectOption("es");
  await o.page.getByRole("button", { name: en.me.saveChanges }).click();
  // The new language applies at once, without a reload.
  await expect(navTab(o.page, "study", es)).toBeVisible();

  const found: string[] = [];
  for (const tab of TABS) {
    await navTab(o.page, tab, es).click();
    await o.page.waitForTimeout(3_000);
    for (const line of englishLines(await o.page.locator("body").innerText())) found.push(`${tab}: ${line}`);
  }
  for (const screen of SCREENS) {
    await goInApp(o.page, screen);
    await o.page.waitForTimeout(3_000);
    for (const line of englishLines(await o.page.locator("body").innerText())) found.push(`${screen}: ${line}`);
  }
  expect(found, "English left on Spanish screens").toEqual([]);

  // And it sticks after a reload.
  await o.page.reload();
  await expect(navTab(o.page, "study", es)).toBeVisible();
});
