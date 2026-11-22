# Browser end-to-end tests

The cases of the staging manual test plan that a browser can check, run in
Chromium against every backend canister on a local icp network. CI runs them
on every PR (`.github/workflows/ci.yml`, job "Browser end-to-end tests").

## How they work

- **Sign-in.** `vite dev` signs in with a dev identity instead of Internet
  Identity (`src/lib/devIdentity.ts`, `import.meta.env.DEV` only, so it never
  reaches a production build). Each test official is a browser context with
  its own random seed in localStorage, so a test can have several people.
- **Content.** `global-setup.ts` makes the test admin (the same fixed identity
  as the canister integration tests) admin of every canister and seeds two
  sports of made-up test content (`support/seed.ts`). Every question's right
  answer reads "Correct ruling", so a test can answer right or wrong on purpose.
- **Admin steps.** What a person can't do in the app (granting the coordinator
  role, switching billing on, an admin comp) goes straight to the canisters
  (`support/backend.ts`), which the tests also use to check what the app wrote.
- **Billing.** `billing/` runs on a second dev server with a build's feature
  switches, the paywall on and Stripe test links. It switches billing on for
  every official, so it runs on its own after the rest.

## Running them

From the repo root, in WSL's own filesystem:

```bash
icp network start -d
icp deploy user content question exam ranking challenge ai_proxy mentorship association report
cd frontend
npx playwright install chromium   # once
npx playwright test --project=cases
npx playwright test --project=billing
```

Re-running against the same network is fine: officials are new each run and
the seed only adds what's missing.

## Manual test plan coverage

| # | Case | Automated | Where | What stays with a person |
|---|------|-----------|-------|--------------------------|
| 1 | Sign-in with a new Internet Identity | No | | Real Internet Identity sign-in, which tests replace with a dev identity. Phone sign-in has its own round. |
| 2 | Profile kept after reload | Yes | `cases/profile.spec.ts` | |
| 3 | Switch sport to football | Yes | `cases/profile.spec.ts` | |
| 4 | Open a rule article, then a casebook play | Partly | `cases/study.spec.ts` | The app has no screen that shows an article's full text: opening an article starts its quiz. Whether wording matches the rule book is a person's check. |
| 5 | Answer every question in an article quiz | Yes | `cases/study.spec.ts` | |
| 6 | Read 20 questions for accuracy | No | | Judging whether questions and answers are correct and clear. |
| 7 | Ranked quiz twice | Yes | `cases/quizzes.spec.ts` | |
| 8 | Leave mid-quiz and come back | Yes | `cases/quizzes.spec.ts` | |
| 9 | Certification exam to the end | Yes | `cases/quizzes.spec.ts` | |
| 10 | Certification exam again | Yes | `cases/quizzes.spec.ts` | |
| 11 | Challenge another official | Yes | `cases/social.spec.ts` | |
| 12 | Unanswered challenge expires after 72 hours | Partly | `cases/social.spec.ts`, `test/ChallengeExpiry.test.mo` | The browser test checks it stays open; the 72-hour rule is a Motoko unit test, since a test can't wait 72 hours. |
| 13 | Friends, State and National boards | Partly | `cases/social.spec.ts` | The streak counting up over consecutive days needs real days to pass. |
| 14 | Earn a badge | Yes | `cases/social.spec.ts` | |
| 15 | Create an association, join by code | Yes | `cases/associations.spec.ts` | |
| 16 | Study assignment and most-missed view | Yes | `cases/associations.spec.ts` | |
| 17 | Seat license page | Yes | `cases/associations.spec.ts`, `billing/pro.spec.ts` | That the apps hide it is checked by unit tests (`purchases`). |
| 18 | Mentorship | Yes | `cases/mentorship-reports.spec.ts`, `src/integration/mentorship.itest.ts` | |
| 19 | Public report card | Yes | `cases/mentorship-reports.spec.ts`, `src/integration/report.itest.ts` | |
| 20 | Rule assistant | Partly | `cases/ai-assistant.spec.ts` | The daily cap is tested. Real answers need an Anthropic key, and whether they cite the right rule is a person's check. |
| 21 | Report a question | Partly | `cases/study.spec.ts` | Reaching the moderation queue and resolving it are tested. The plan says it also appears on Me, which the app doesn't do. |
| 22 | Offline | Partly | `cases/resilience.spec.ts` | Synced content and queued answers are tested in the browser. Installing the app (PWA) and its service worker need a production build on a phone. |
| 23 | Spanish | Partly | `cases/spanish.spec.ts` | No English left on any tab is tested. Whether the Spanish reads well needs a native speaker. |
| 24 | Error screens | Yes | `cases/resilience.spec.ts` | Every screen is opened with the canisters unreachable: none may crash, go blank, stay on a spinner or leave a call uncaught, and retry recovers. |
| 25 | Privacy and terms | Yes | `cases/legal-account.spec.ts` | |
| 26 | Delete account | Yes | `cases/legal-account.spec.ts` | |
| 27 | Pro | Partly | `billing/pro.spec.ts` | The upgrade link, Pro after checkout, the higher assistant limit and the portal link are tested. Paying on Stripe's page needs Stripe test keys, and the longer exam history needs exams older than 30 days. |
