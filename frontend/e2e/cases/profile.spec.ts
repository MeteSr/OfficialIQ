import { test, expect, en, signUp, fillProfileForm, navTab } from "../support/fixtures";
import { BASKETBALL, FOOTBALL, articleTitle } from "../support/seed";

// Manual test plan cases 2 and 3: the profile an official picks decides
// what they study, and it survives a reload.

test("case 2: sport, level and state are kept after a reload and shown on Me", async ({ newOfficial }) => {
  const o = await newOfficial();
  await signUp(o, { sport: BASKETBALL.id, state: "KS" });

  await o.page.reload();
  await expect(o.page.getByText(o.name, { exact: true })).toBeVisible();
  await expect(o.page.getByText("NCAA BASKETBALL · VARSITY · KS")).toBeVisible();

  await o.page.getByRole("button", { name: en.me.editProfile, exact: true }).click();
  await expect(o.page.getByLabel(en.me.sportLabel, { exact: true })).toHaveValue(BASKETBALL.id);
  await expect(o.page.getByLabel(en.me.levelLabel, { exact: true })).toHaveValue("varsity");
  await expect(o.page.getByLabel(en.me.stateLabel, { exact: true })).toHaveValue("KS");
});

test("case 3: switching to football shows football content only", async ({ newOfficial }) => {
  const o = await newOfficial();
  await signUp(o, { sport: BASKETBALL.id });

  await o.page.getByRole("button", { name: en.me.editProfile, exact: true }).click();
  await fillProfileForm(o.page, o.name, { sport: FOOTBALL.id });
  await o.page.getByRole("button", { name: en.me.saveChanges }).click();
  await expect(o.page.getByText("NCAA FOOTBALL · VARSITY · TX")).toBeVisible();

  await navTab(o.page, "study").click();
  await expect(o.page.getByText(articleTitle(FOOTBALL, 1))).toBeVisible();
  await expect(o.page.getByText(articleTitle(FOOTBALL, 2))).toBeVisible();
  await expect(o.page.getByText(/E2E basketball/)).toHaveCount(0);

  // A quiz from an article is football questions only.
  await o.page.getByText(articleTitle(FOOTBALL, 1)).click();
  await expect(o.page.getByText(/E2E football rule 1 question \d+/)).toBeVisible();
  await expect(o.page.getByText(/E2E basketball/)).toHaveCount(0);
});
