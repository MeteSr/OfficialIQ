import { test, expect, en, signUp, navTab } from "../support/fixtures";
import { grantPro, setPaywall } from "../support/backend";

// Manual test plan case 27, against a dev server built with the paywall on
// and Stripe test links (playwright.config.ts, project "billing"). Billing
// is switched on for every official while this runs, so it runs on its own.
//
// The Stripe checkout itself (a test card on Stripe's page, and the claim on
// the way back) needs Stripe test keys and stays manual: a finished checkout
// ends in the user canister marking the official Pro, which an admin comp
// does here.

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { await setPaywall(true); });
test.afterAll(async () => { await setPaywall(false); });

const usage = (used: number, limit: number) =>
  en.ruleAssistant.usageToday.replace("{{used}}", String(used)).replace("{{limit}}", String(limit));

test("case 27: upgrade prompt, Pro after checkout, a higher assistant limit and the subscription portal", async ({ newOfficial }) => {
  const o = await newOfficial();
  await signUp(o);

  // Free: the plan row offers an upgrade that opens Stripe's checkout for this official.
  await o.page.reload();
  await expect(o.page.getByText(en.plan.rowFree, { exact: true })).toBeVisible();
  await o.page.getByRole("button", { name: en.plan.upgrade, exact: true }).click();
  await expect(o.page.getByText(en.plan.upgradeTitle)).toBeVisible();
  const yearly = o.page.getByRole("link", { name: new RegExp(en.plan.yearly.replace("{{price}}", "\\$49\\.99")) });
  const href = new URL((await yearly.getAttribute("href"))!);
  expect(`${href.origin}${href.pathname}`).toBe("https://buy.stripe.com/test_e2e_yearly");
  expect(href.searchParams.get("client_reference_id")).toBe(o.principal.toText());
  await o.page.getByRole("button", { name: en.plan.notNow }).click();

  await o.page.goto("/ask");
  await expect(o.page.getByText(usage(0, 3))).toBeVisible();

  // What a finished checkout ends in: Pro on the official's account.
  await grantPro(o.principal, Date.now() + 30 * 86_400_000);
  await o.page.goto("/me");
  await expect(o.page.getByText(new RegExp(`^${en.plan.rowPro} ·`))).toBeVisible({ timeout: 30_000 });
  await expect(o.page.getByRole("link", { name: en.plan.manage })).toHaveAttribute("href", "https://billing.stripe.com/p/login/test_e2e");

  await o.page.goto("/ask");
  await expect(o.page.getByText(usage(0, 50))).toBeVisible();
  await navTab(o.page, "me").click();
});
