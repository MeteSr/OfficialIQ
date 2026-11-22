import { test, expect, en, signUp } from "../support/fixtures";

// Manual test plan case 20, the part that needs no AI provider: the daily
// cap. The test network has no Anthropic key, so every question is counted
// and then refused as "not configured"; whether real answers cite the right
// rule stays a manual check.

const CAP_WITH_BILLING_OFF = 8;

test("case 20: the rule assistant stops at the daily cap and says so", async ({ newOfficial }) => {
  const o = await newOfficial();
  await signUp(o);
  await o.page.goto("/ask");
  await expect(o.page.getByText(en.ruleAssistant.title)).toBeVisible();
  const usage = (used: number) => en.ruleAssistant.usageToday.replace("{{used}}", String(used)).replace("{{limit}}", String(CAP_WITH_BILLING_OFF));

  const input = o.page.getByPlaceholder(en.ruleAssistant.inputPlaceholder);
  for (let i = 1; i <= CAP_WITH_BILLING_OFF; i++) {
    await input.fill(`E2E question ${i}: can an airborne shooter be charged?`);
    await o.page.getByRole("button", { name: en.ruleAssistant.ask, exact: true }).click();
    await expect(o.page.getByText(usage(i))).toBeVisible({ timeout: 60_000 });
  }
  await expect(o.page.getByText(/isn't configured yet/).first()).toBeVisible();

  const capped = o.page.getByPlaceholder(en.ruleAssistant.limitReached);
  await expect(capped).toBeVisible();
  await expect(capped).toBeDisabled();
  await expect(o.page.getByRole("button", { name: en.ruleAssistant.ask, exact: true })).toBeDisabled();
});
