import { test, expect, en, signUp, navTab } from "../support/fixtures";
import { canister, grantRole, identityFromHex } from "../support/backend";
import { playQuiz } from "../support/quiz";
import { BASKETBALL, RULE_QUESTIONS, CASEBOOK_QUESTIONS } from "../support/seed";

const QUESTIONS_PER_ARTICLE = RULE_QUESTIONS + CASEBOOK_QUESTIONS;

// Manual test plan cases 15 to 17: a coordinator's association, its study
// assignments and its seat license page.

test("cases 15 to 17: a coordinator creates an association, an official joins and completes an assignment", async ({ newOfficial }) => {
  const coord = await newOfficial({ name: `E2E Coordinator ${Date.now() % 100000}` });
  const member = await newOfficial();
  await signUp(coord);
  await signUp(member);

  // An admin grants the coordinator role (the set-role admin task).
  await coord.page.goto("/association");
  await expect(coord.page.getByText(en.association.coordinatorAccessNeeded)).toBeVisible();
  await grantRole(coord.principal, "Coordinator");
  await coord.page.reload();

  // Case 15: create, share the join code, join.
  const assocName = `E2E Association ${Date.now() % 100000}`;
  await coord.page.getByPlaceholder(en.association.namePlaceholder).fill(assocName);
  await coord.page.getByRole("button", { name: en.association.create, exact: true }).click();
  await expect(coord.page).toHaveURL(/\/association\/[^/]+$/);
  const assocId = decodeURIComponent(new URL(coord.page.url()).pathname.split("/").pop()!);
  // Only the coordinator and members can read an association.
  const rec = ((await (await canister("association", identityFromHex(coord.seed))).getAssociation(assocId)) as { joinCode: string }[])[0];
  await expect(coord.page.getByText(rec.joinCode)).toBeVisible();

  await member.page.goto("/association");
  await member.page.getByPlaceholder(en.association.joinCodePlaceholder).fill(rec.joinCode);
  await member.page.getByRole("button", { name: en.groups.join, exact: true }).click();
  await expect(member.page).toHaveURL(new RegExp(`/association/${encodeURIComponent(assocId)}$`));

  await coord.page.reload();
  await expect(coord.page.getByText(member.name, { exact: true })).toBeVisible();

  // Case 16: assign a module to everyone; the member sees it and completes it.
  const title = `E2E assignment ${Date.now() % 100000}`;
  await coord.page.getByRole("button", { name: en.assocDetail.assignModule }).click();
  await coord.page.getByPlaceholder(en.assocDetail.titlePlaceholder).fill(title);
  await coord.page.getByRole("button", { name: "Art. 1", exact: true }).click();
  const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await coord.page.locator('input[type="date"]').fill(due);
  await coord.page.getByRole("button", { name: en.assocDetail.assignModuleButton, exact: true }).click();
  await expect(coord.page.getByText(title)).toBeVisible();
  // "All members" means the officials, not the coordinator.
  await expect(coord.page.getByText(en.assocDetail.completedCount.replace("{{done}}", "0").replace("{{target}}", "1").replace("{{pct}}", "0"))).toBeVisible();

  await navTab(member.page, "study").click();
  await expect(member.page.getByText(en.study.assignedModules)).toBeVisible();
  await member.page.getByText(title).click();
  // Some wrong, so the coordinator's most-missed view has data.
  await playQuiz(member.page, { correct: (i) => i % 3 !== 0 });

  await coord.page.reload();
  await expect(coord.page.getByText(en.assocDetail.completedCount.replace("{{done}}", "1").replace("{{target}}", "1").replace("{{pct}}", "100"))).toBeVisible({ timeout: 30_000 });
  // Most-missed needs three answers to a question. The assignment covered
  // all of Art. 1 once; two more passes, all wrong, make sure of it however
  // the other tests ran.
  for (let pass = 0; pass < 2; pass++) {
    await member.page.goto(`/quiz/${BASKETBALL.id}:art1?count=${QUESTIONS_PER_ARTICLE}`);
    await playQuiz(member.page, { correct: () => false });
  }
  await coord.page.getByRole("button", { name: new RegExp(en.assocDetail.viewAnalytics) }).click();
  await expect(coord.page.getByText(en.assocAnalytics.pageTitle.replace("{{name}}", assocName))).toBeVisible();
  await expect(coord.page.getByText(en.assocAnalytics.mostMissedTitle)).toBeVisible();
  // The exam canister passes answers on to the question bank shortly after a quiz.
  await expect(async () => {
    await coord.page.reload();
    await expect(coord.page.getByText(/Missed \d+ of \d+ attempts/).first()).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });

  // Case 17: the seat license page, on the website. With billing off it
  // says everything is open; buying seats is in billing/pro.spec.ts.
  await coord.page.goto(`/association/${encodeURIComponent(assocId)}/license`);
  await expect(coord.page.getByText(en.license.title)).toBeVisible();
  await expect(coord.page.getByText(en.license.paywallOff)).toBeVisible();
});
