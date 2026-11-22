import type { Page } from "@playwright/test";
import { test, expect, en, signUp, navTab, goInApp } from "../support/fixtures";
import { canister, identityFromHex } from "../support/backend";
import { CORRECT_CHOICE, BASKETBALL, articleTitle } from "../support/seed";

// Manual test plan cases 22 and 24: studying offline, and what each screen
// does when the canisters can't be reached.

async function pendingActions(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const open = indexedDB.open("officialiq-offline");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("pendingActions")) { db.close(); resolve(0); return; }
      const req = db.transaction("pendingActions").objectStore("pendingActions").count();
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = () => reject(req.error);
    };
  }));
}

async function cachedQuestions(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((resolve) => {
    const open = indexedDB.open("officialiq-offline");
    open.onerror = () => resolve(0);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("questions")) { db.close(); resolve(0); return; }
      const req = db.transaction("questions").objectStore("questions").count();
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = () => resolve(0);
    };
  }));
}

test("case 22: synced content works offline and answers send once back online", async ({ newOfficial }) => {
  const o = await newOfficial();
  await signUp(o);
  // Signing in syncs the sport's content into IndexedDB.
  await o.page.reload();
  await expect.poll(() => cachedQuestions(o.page), { timeout: 60_000 }).toBeGreaterThan(0);
  // Load the quiz screen once while online (vite dev serves it on demand).
  await o.page.goto(`/quiz/${BASKETBALL.id}:art1?count=5`);
  await expect(o.page.getByRole("button", { name: CORRECT_CHOICE })).toBeVisible();
  // In-app, so the loaded screen stays in this page's module cache (a
  // production build's service worker precaches it instead).
  await goInApp(o.page, "/study");
  await expect(o.page.getByText(articleTitle(BASKETBALL, 1))).toBeVisible();

  await o.context.setOffline(true);
  try {
    await navTab(o.page, "home").click();
    await navTab(o.page, "study").click();
    await expect(o.page.getByText(articleTitle(BASKETBALL, 1))).toBeVisible();

    await goInApp(o.page, `/quiz/${BASKETBALL.id}:art1?count=3`);
    await expect(o.page.getByText(en.quiz.offlineBanner)).toBeVisible({ timeout: 30_000 });
    const stem = (await o.page.getByText(/E2E basketball rule 1 question \d+/).first().innerText()).trim();
    await o.page.getByRole("button", { name: CORRECT_CHOICE }).click();
    await expect(o.page.getByText(`${en.challenge.correct} —`)).toBeVisible();
    await expect.poll(() => pendingActions(o.page)).toBeGreaterThan(0);

    // Back online: the queued answer is sent.
    await o.context.setOffline(false);
    await expect.poll(() => pendingActions(o.page).catch(() => -1), { timeout: 60_000 }).toBe(0);

    const admin = await canister("question");
    const bank = (await admin.listForSync(BASKETBALL.id, [], 500n)) as { questions: { id: string; stem: string }[] };
    const id = bank.questions.find((q) => q.stem === stem)!.id;
    const mine = await canister("question", identityFromHex(o.seed));
    await expect.poll(async () => {
      const [h] = (await mine.getMyHistoryBatch([id])) as ([] | [{ timesAnswered: bigint }])[];
      return h.length ? Number(h[0].timesAnswered) : 0;
    }, { timeout: 30_000 }).toBe(1);
  } finally {
    await o.context.setOffline(false);
  }
});

// Every screen, opened with the canisters unreachable. Screens must not
// crash or go blank; the ones that already use useCanisterQuery offer a
// retry. Screens that only show a spinner or an empty list are listed in
// the test's annotations: a person still judges whether that explains itself.
const ROUTES = [
  "/home", "/study", "/exam", "/ranks", "/me", "/weekly-quiz", "/monthly-quiz", "/progress", "/groups",
  "/exam-sim", "/commute", "/mentor", "/association", "/moderation", "/reports", "/reports/shared", "/ask",
  "/ai-drills", "/ai-scenarios", "/schedule", "/analytics", "/transcript", "/account/delete", "/rule-changes",
  "/readiness", "/challenge/e2e-missing", "/groups/e2e-missing", "/mentor/e2e-missing", "/association/e2e-missing",
  "/report/e2e-missing", `/quiz/${BASKETBALL.id}:art1`, "/calls/e2e-missing", "/refresher/e2e-missing", "/crew/e2e-missing",
];

test("case 24: no screen crashes or goes blank when the canisters can't be reached", async ({ newOfficial }) => {
  test.setTimeout(480_000);
  const o = await newOfficial();
  await signUp(o);
  const crashes: string[] = [];
  // The app's own frame in the stack says which screen left a call uncaught
  // (the URL alone can be the next screen, as a failing call takes a while).
  const appFrame = (stack = "") => stack.split("\n").find(l => l.includes("/src/") && !l.includes("/src/services/") && !l.includes("/src/declarations/"))?.trim() ?? stack.split("\n")[1]?.trim() ?? "";
  o.page.on("pageerror", (e) => crashes.push(`${o.page.url()}: ${e.message} ${appFrame(e.stack)}`));

  await o.page.route("**/api/**", (route) => route.abort("failed"));
  const unexplained: string[] = [];
  for (const path of ROUTES) {
    await goInApp(o.page, path);
    await o.page.waitForTimeout(2_000);
    // A failing call takes a few seconds (the agent retries); give the
    // screen time to settle on its error before judging it.
    await expect(o.page.getByText(/^(Loading…|Loading questions…)$/)).toHaveCount(0, { timeout: 30_000 }).catch(() => {});
    // The error boundary's text; LoadError's "Something went wrong." is fine.
    await expect(o.page.getByText(en.errorBoundary.body), `${path} crashed`).toHaveCount(0);
    const text = (await o.page.locator("body").innerText()).replace(/\s+/g, " ").trim();
    const navText = (await o.page.getByRole("navigation").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    const own = text.replace(navText, "").trim();
    expect(own.length, `${path} is blank`).toBeGreaterThan(0);
    if (!own.includes(en.common.retry) && /^(Loading…|Loading questions…)?$/.test(own)) unexplained.push(path);
  }
  expect(unexplained, "screens that only show a spinner").toEqual([]);

  // Ranks uses useCanisterQuery: it offers a retry, and retrying recovers.
  await goInApp(o.page, "/ranks");
  await expect(o.page.getByRole("button", { name: en.common.retry })).toBeVisible({ timeout: 30_000 });
  await o.page.unroute("**/api/**");
  // Ranks may already have retried by itself once the canisters are back.
  await o.page.getByRole("button", { name: en.common.retry }).click({ timeout: 5_000 }).catch(() => {});
  await expect(o.page.getByRole("button", { name: en.common.retry })).toHaveCount(0, { timeout: 30_000 });
  // An uncaught error is a canister call nothing handles: the screen it
  // belongs to shows stale or empty data instead of saying it failed.
  expect(crashes, "uncaught errors while offline").toEqual([]);
});
