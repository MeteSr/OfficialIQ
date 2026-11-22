import { test, expect, en, signUp, navTab } from "../support/fixtures";
import { canister } from "../support/backend";
import { playQuiz } from "../support/quiz";
import { BASKETBALL } from "../support/seed";
import { PRIVACY, TERMS } from "../../src/legal";

// Manual test plan cases 25 and 26: the legal pages, and deleting an account.

test("case 25: privacy and terms open from the Me tab and the landing page", async ({ newOfficial, browser }, testInfo) => {
  const o = await newOfficial();
  await signUp(o);
  for (const [label, doc, path] of [[en.me.privacyPolicy, PRIVACY, "/privacy"], [en.me.terms, TERMS, "/terms"]] as const) {
    await navTab(o.page, "me").click();
    await o.page.getByRole("button", { name: new RegExp(label) }).click();
    await expect(o.page).toHaveURL(new RegExp(`${path}$`));
    await expect(o.page.getByRole("heading", { name: doc.title })).toBeVisible();
    await expect(o.page.getByText(en.legal.draft)).toBeVisible();
    await expect(o.page.getByRole("heading", { name: doc.sections[0].heading })).toBeVisible();
    await o.page.goBack();
  }

  // A visitor who isn't signed in, on the landing page.
  const visitor = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const page = await visitor.newPage();
    for (const [label, doc, path] of [[en.me.privacyPolicy, PRIVACY, "/privacy"], [en.me.terms, TERMS, "/terms"]] as const) {
      await page.goto("/?skipDevAuth");
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { name: doc.title })).toBeVisible();
      await expect(page.getByText(en.legal.draft)).toBeVisible();
    }
  } finally {
    await visitor.close();
  }
});

test("case 26: a deleted account leaves the leaderboards and the same identity can sign up again", async ({ newOfficial }) => {
  const state = `D${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
  const o = await newOfficial();
  const watcher = await newOfficial();
  await signUp(o, { state });
  await signUp(watcher, { state });
  await o.page.goto(`/quiz/${BASKETBALL.id}:art1?count=5`);
  await playQuiz(o.page);

  const ranking = await canister("ranking");
  await expect.poll(async () => ((await ranking.getStats(o.principal)) as unknown[]).length, { timeout: 60_000 }).toBe(1);
  await watcher.page.goto("/ranks");
  await watcher.page.getByRole("button", { name: en.ranks.tabState, exact: true }).click();
  await expect(watcher.page.getByText(o.name, { exact: true })).toBeVisible();

  await navTab(o.page, "me").click();
  await o.page.getByRole("button", { name: new RegExp(en.me.deleteAccount) }).click();
  await expect(o.page).toHaveURL(/\/account\/delete$/);
  await o.page.getByLabel(en.deleteAccount.typeToConfirm.replace("{{word}}", en.deleteAccount.confirmWord)).fill(en.deleteAccount.confirmWord);
  await o.page.getByRole("button", { name: en.deleteAccount.confirm }).click();
  await expect(o.page.getByText(en.deleteAccount.doneTitle)).toBeVisible({ timeout: 60_000 });

  // The profile goes at once.
  const user = await canister("user");
  expect(await user.getPublicProfile(o.principal)).toEqual([]);
  // The other canisters forget the official shortly after (a timer in the user canister).
  await expect.poll(async () => ((await ranking.getStats(o.principal)) as unknown[]).length, { timeout: 150_000, intervals: [5_000] }).toBe(0);
  await watcher.page.reload();
  await watcher.page.getByRole("button", { name: en.ranks.tabState, exact: true }).click();
  await expect(watcher.page.getByText(o.name, { exact: true })).toHaveCount(0);

  // The same identity can start over.
  await signUp(o, { state });
});
