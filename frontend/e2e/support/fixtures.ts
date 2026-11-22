import { randomBytes } from "node:crypto";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import en from "../../src/i18n/en.json";
import es from "../../src/i18n/es.json";
import { DEV_IDENTITY_SEED_KEY } from "../../src/lib/devIdentity";
import { ADMIN_SEED_HEX, principalOf, type Principal } from "./backend";
import { BASKETBALL, LEVEL } from "./seed";

// Each official is their own browser context signed in as their own
// identity: the app's dev sign-in (`vite dev` only, src/lib/devIdentity.ts)
// reads a seed from localStorage, so no Internet Identity pop-up is needed.

export type Official = {
  page: Page;
  context: BrowserContext;
  seed: string;
  principal: Principal;
  name: string;
};

export type NewOfficial = (opts?: { seed?: string; name?: string; locale?: string }) => Promise<Official>;

export type Profile = { sport?: string; level?: string; state?: string; language?: "en" | "es" };

let counter = 0;

export const test = base.extend<{ newOfficial: NewOfficial; admin: NewOfficial }>({
  newOfficial: async ({ browser }, use, testInfo) => {
    const made: { official: Official; logs: string[] }[] = [];
    await use(async (opts = {}) => {
      const seed = opts.seed ?? randomBytes(32).toString("hex");
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width: 390, height: 844 },
        locale: opts.locale ?? "en-US",
        permissions: ["clipboard-read", "clipboard-write"],
      });
      await context.addInitScript(([key, value]) => {
        try { window.localStorage.setItem(key, value); } catch { /* opaque origin (about:blank) */ }
      }, [DEV_IDENTITY_SEED_KEY, seed] as const);
      const page = await context.newPage();
      const log: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") log.push(`console: ${m.text()}`); });
      page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
      const name = opts.name ?? `E2E Official ${++counter}${randomBytes(2).toString("hex")}`;
      const official = { page, context, seed, principal: principalOf(seed), name };
      made.push({ official, logs: log });
      return official;
    });
    // On a failure, print what each official was looking at: the CI log is
    // often the only place to see it.
    if (testInfo.status !== testInfo.expectedStatus) {
      for (const { official, logs } of made) {
        for (const p of official.context.pages()) {
          const text = await p.locator("body").innerText({ timeout: 2_000 }).catch(() => "(no body)");
          // eslint-disable-next-line no-console
          console.log(`\n--- ${official.name} at ${p.url()} ---\n${text.slice(0, 3_000)}\n${logs.slice(-15).join("\n")}`);
        }
      }
    }
    for (const { official } of made) await official.context.close().catch(() => {});
  },

  /** The test admin (the canisters' admin identity) as a browser user. */
  admin: async ({ newOfficial }, use) => {
    await use((opts = {}) => newOfficial({ ...opts, seed: ADMIN_SEED_HEX, name: opts.name ?? "E2E Admin" }));
  },
});

export { expect };
export { en, es };

/** Signs up through onboarding on the Me tab and waits for the profile to show. */
export async function signUp(o: Official, profile: Profile = {}): Promise<void> {
  const { page } = o;
  await page.goto("/me");
  await expect(page.getByText(en.me.welcomeTitle)).toBeVisible();
  await fillProfileForm(page, o.name, profile);
  await page.getByRole("button", { name: en.me.createProfile }).click();
  const strings = profile.language === "es" ? es : en;
  await expect(page.getByRole("button", { name: strings.me.editProfile, exact: true })).toBeVisible({ timeout: 30_000 });
}

/** A profile that already exists (the admin's, on a re-run) is kept. */
export async function ensureSignedUp(o: Official, profile: Profile = {}): Promise<void> {
  await o.page.goto("/me");
  const welcome = o.page.getByText(en.me.welcomeTitle);
  const edit = o.page.getByRole("button", { name: en.me.editProfile, exact: true });
  await expect(welcome.or(edit)).toBeVisible({ timeout: 30_000 });
  if (await welcome.isVisible()) await signUp(o, profile);
}

export async function fillProfileForm(page: Page, name: string, p: Profile): Promise<void> {
  await page.getByLabel(en.me.displayNameLabel, { exact: true }).fill(name);
  const sport = page.getByLabel(en.me.sportLabel, { exact: true });
  // Options come from the content canister's sport registry.
  await expect(sport.locator(`option[value="${p.sport ?? BASKETBALL.id}"]`)).toHaveCount(1);
  await sport.selectOption(p.sport ?? BASKETBALL.id);
  await page.getByLabel(en.me.levelLabel, { exact: true }).selectOption(p.level ?? LEVEL.id);
  await page.getByLabel(en.me.stateLabel, { exact: true }).fill(p.state ?? "TX");
  await page.getByLabel(en.me.languageLabel, { exact: true }).selectOption(p.language ?? "en");
}

/** Client-side navigation (no reload), like tapping a link in the app. */
export async function goInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

/** A bottom-nav tab (its label is shown in capitals). */
export function navTab(page: Page, tab: keyof typeof en.nav, strings: typeof en = en) {
  return page.getByRole("navigation").getByRole("button", { name: strings.nav[tab].toUpperCase(), exact: true });
}
