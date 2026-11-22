import { defineConfig, devices } from "@playwright/test";

// Browser end-to-end tests (e2e/, see e2e/README.md): the app in Chromium
// against every backend canister on a local icp network, signed in with the
// dev identity instead of Internet Identity. CI runs them on every PR
// (.github/workflows/ci.yml, job "Browser end-to-end tests").
//
// Two dev servers: the app as `vite dev` serves it (every feature on, billing
// off), and one with a build's switches and the paywall on for the billing
// tests, which change a setting every official shares, so they run on their
// own afterwards: `npx playwright test --project=billing`.

const CI = !!process.env.CI;
const APP = "http://localhost:5173";
const BILLING_APP = "http://localhost:5174";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Update calls go through consensus, and a test signs up several officials.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: CI ? 2 : undefined,
  retries: CI ? 1 : 0,
  reporter: CI ? [["list"], ["github"]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    actionTimeout: 20_000,
    trace: "off",
  },
  projects: [
    { name: "cases", testDir: "e2e/cases", use: { baseURL: APP } },
    { name: "billing", testDir: "e2e/billing", use: { baseURL: BILLING_APP } },
  ],
  webServer: [
    {
      command: "npx vite --port 5173 --strictPort",
      url: APP,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      command: "npx vite --port 5174 --strictPort",
      url: BILLING_APP,
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: {
        FEATURES_FROM_ENV: "1",
        LAUNCH_SPORTS: "ncaa_basketball,ncaa_football",
        FEATURE_AI: "true",
        FEATURE_PAYWALL: "true",
        STRIPE_LINK_MONTHLY: "https://buy.stripe.com/test_e2e_monthly",
        STRIPE_LINK_YEARLY: "https://buy.stripe.com/test_e2e_yearly",
        STRIPE_PORTAL_URL: "https://billing.stripe.com/p/login/test_e2e",
      },
    },
  ],
});
