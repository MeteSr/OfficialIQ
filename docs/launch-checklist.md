# Q3 launch readiness checklist

State of `main` at `e973c23` (PR #53 merged), checked on 2026-11-18.
Every line is **Ready** or **Not ready**, with an owner: **Mete** for
accounts, money, licences, settings and decisions; **Claude** for code,
CI and docs. Update a line when it changes, rather than adding a new one.

## Launch blockers (short version)

Nothing below is blocked on code. The app can't go live until these are done:

1. **Mete:** fund the deploy identity with cycles and set `ICP_IDENTITY_PEM` on the `staging` environment. Staging has never deployed: every "Deploy (staging)" run so far, including the one for #53, stopped at "Skip until the deploy identity is configured".
2. **Mete:** run the Admin task `seed-ncaa` (after `seed-content`) to import the NCAA men's basketball and football rule books, then `set-ai-config` and `generate-questions` (re-run until it reports nothing left) to make the question bank, and add `ncaa_football` to `LAUNCH_SPORTS`. The practice content in `seedData.mjs` is no longer seeded outside local development.
3. **Mete + Claude:** run the staging smoke test (ranked quiz, cert exam, challenge) once staging is up.
4. **Mete:** set up the production accounts and keys: a spend-capped Anthropic key, VAPID keys and the push relay identity.
5. **Mete:** ship Android and iOS. The iOS project, in-app sign-in and release workflows are built (§7); what's left is the Apple and Google accounts and the secrets listed in `docs/MOBILE.md`, then a sign-in test on a real phone.
6. **Mete:** finish the privacy policy and terms (§5): fill in the bracketed fields and turn off the draft banner. Both stores need the privacy policy URL.

## 1. Features

| Area | What exists | Status | Owner |
|---|---|---|---|
| Study (rule articles, casebook plays) | `content` canister, StudyPage, QuizPage, offline sync | Ready (NCAA only, see §5) | Claude |
| Ranked quiz, cert exam, challenge | Graded on the `exam` canister since #51; random picks and claim retry since #53 | Ready in code, **not tested on mainnet** | Claude |
| Rankings, streaks | `ranking` canister, Friends / State / National boards | Ready | Claude |
| Associations, coordinators, assignments | `association` canister; coordinator role is granted by an admin (#51) | Ready | Claude |
| Mentorship, report cards | `mentorship` and `report` canisters, shareable links | Ready | Claude |
| Private profiles and exam history | Only leaderboard fields are public (#51) | Ready | Claude |
| AI features (rule assistant, drills, scenario generator) | `ai_proxy` outcalls with per-user and global daily caps | Ready in code; needs the production key (§4) | Mete |
| Audio / TTS narration | `scripts/generate-audio.sh` with ElevenLabs | Hidden at launch (`FEATURE_AUDIO`); needs a production ElevenLabs account (BUSINESS.md #6) | Mete |
| Push notifications (streak milestones) | Web Push, `push-relay.yml` every 15 min | Not ready: needs keys and relay identity (§4) | Mete |
| Spanish UI | Full coverage, enforced by `i18n/coverage.test.ts` (#49) | Ready in code; **native-speaker review pending** | Mete |
| Landing page | Merged in #34 | Ready | Claude |
| Installable PWA | Service worker, offline queue | Ready | Claude |
| Delete account in the app (Apple 5.1.1(v), Play account deletion policy) | Me → Delete account, also on the website at `/account/delete` (the web link Play asks for). Profile goes at once; a timer on the user canister has the other 9 canisters forget the official, retrying until each has | Ready in code; check on staging | Claude |
| Report a wrong or unclear question | Link under each answered quiz or challenge question; admins resolve reports on the Moderation Queue | Ready in code | Claude |
| Crash and error reporting | Crashes and failed loads go to the user canister's error log, without identifying the official; admins read it on the Moderation Queue. No third-party service | Ready in code | Claude |
| Feature switches | Repository variables decide which sports and features a build shows (`docs/DEPLOYMENT.md` §8). Launch defaults: NCAA only, no audio, no clip submissions | Ready | Claude |

## 2. Stubbed or missing

| Item | Where | Status | Owner |
|---|---|---|---|
| Monthly quiz "days left" was hardcoded to 4 (and said 25 questions instead of 50) | Now counted from the date (`lib/monthlyWindow.ts`) | Ready | Claude |
| Weekly quiz "agree %" was hardcoded to 68% | Now real, from `question.getAnswerRates`; hidden until a question has 10 answers | Ready | Claude |
| Services fall back to stub data when a canister ID is missing | `frontend/src/lib/icEnv.ts` | Ready (only affects dev builds; staging smoke test confirms) | Claude |
| Game clips (issue #29) | Film room, uploads to Cloudflare Stream, per-association clips, rights statement, review, "you make the call" built; no clips yet | Ready for launch hidden: set up video hosting (DEPLOYMENT.md, "Video hosting"), find footage, then set `FEATURE_CLIP_SUBMISSIONS` | Mete |
| Badges UI | Dropped in the design handoff; back on the Me page (Mete's call, 2026-11-18) | Ready | Claude |
| Assigning-platform schedule sync | Manual entry works; no ArbiterSports/RefTown API (issue #30) | Ready for launch with manual entry | Mete |
| French / Portuguese | Intentionally not offered | Ready (out of scope for launch) | Mete |

## 3. CI and deploy

| Item | Status | Owner |
|---|---|---|
| CI on `main`: frontend tests + build, canister type-check + build, canister integration tests (#53) | Ready, green on `e973c23` | Claude |
| Stable Compatibility check | Ready, green on `e973c23` | Claude |
| Toolchain on icp-cli + mops (#35) | Ready | Claude |
| Deploy pipeline: staging on every `main` commit, production by manual run (#36) | Ready in code, **never run** | Claude |
| `ICP_IDENTITY_PEM` on the `staging` and `production` environments (`DFX_IDENTITY_PEM` also accepted) | Not ready | Mete |
| Cycles on the deploy identity: ~28.5T per environment for the first deploy, so about 57T for staging plus production, plus top-ups (`docs/DEPLOYMENT.md` §2) | Not ready | Mete |
| Required reviewers on the `production` environment | Not ready (recommended) | Mete |
| `.icp/data/mappings/*.ids.json` committed | Not ready: written by the first deploy | Claude (automatic) |
| Weekly ICP freshness workflow can open PRs: Settings, Actions, "Allow GitHub Actions to create and approve pull requests" | Not ready (the workflow has never run) | Mete |
| Seeding content and setting the AI key from GitHub: Admin task `seed-content` and `set-ai-config` (needs the `ANTHROPIC_API_KEY` environment secret) | Ready in code; run after the first deploy | Mete (run), Claude (built) |
| Open Dependabot PRs (#37 to #39, #41 to #46, #48, #52), including majors for TypeScript 7, vitest 5, i18next 27, web-push 4 | Not ready: triage before launch, majors need checking | Claude |

**Note on secrets:** icp-cli has no cycles wallet, so there is no wallet ID secret to set. Deploys spend from the identity's cycles-ledger balance.

## 4. Production accounts, keys and settings

| Item | Status | Owner |
|---|---|---|
| Spend-capped Anthropic key in a dedicated Console workspace (`docs/DEPLOYMENT.md` §7), saved as the `ANTHROPIC_API_KEY` environment secret, then Admin task `set-ai-config` | Not ready | Mete |
| ElevenLabs production account | Not ready | Mete |
| `PUSH_RELAY_IDENTITY_PEM` secret, then Admin task `set-push-relay` | Not ready | Mete |
| `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` secrets | Not ready | Mete |
| Decide whether the GitHub Actions push relay is permanent | Not ready | Mete |
| Grant coordinator roles with Admin task `set-role` | Not ready (after deploy) | Mete |
| Claim app admin with the deploy identity: happens on the first Admin task `seed-content` run | Not ready (after deploy) | Mete |

## 5. Content and legal

| Item | Status | Owner |
|---|---|---|
| NCAA men's basketball and football rule text: imported word for word from the NCAA's own PDFs at seed time (`seed-ncaa`); none is in the repository. Mete cleared going ahead with both (issue #1, BUSINESS.md #1) | Ready in code; run `seed-ncaa` after deploy | Mete (run), Claude (built) |
| FIBA / FIFA / World Rugby content (issue #50): needs licensed rulebooks; Claude won't write rules text without them | Not ready; launch can go NCAA-only if these sports are hidden | Mete |
| NFHS Basketball is registered with no content | Ready: only `LAUNCH_SPORTS` (default `ncaa_basketball`) is offered | Claude |
| Privacy policy and terms pages (both stores require a privacy policy URL) | Pages built at `/privacy` and `/terms`, linked from the Me tab and the landing page, with a draft written from what the app stores and sends (`frontend/src/legal/index.ts`). **Mete:** fill in the bracketed fields (operator, contact email, effective date, governing law), review (ideally with a lawyer), then set `LEGAL_DRAFT` to `false` | Mete (text), Claude (pages) |
| Search indexing: page titles, descriptions, link previews, `robots.txt`, `sitemap.xml`, prerendered landing and legal pages, real 404s, noindex app shell | Ready in code (`frontend/build-config/seo.ts`). Production is noindex until the `SITE_URL` repository variable is set: **Mete:** set it to the custom domain once it's live (`docs/DEPLOYMENT.md`, "Search indexing"), then submit the sitemap in Google Search Console and Bing Webmaster Tools | Claude (code), Mete (variable, Search Console) |

## 6. Quality and review findings

From the engineering review ([doc](https://claude.ai/artifact/G4rXTTcTA2JB9Cd5egHcgW)), ranked by impact. "Before launch" marks the ones worth doing before real users arrive.

| # | Finding | Status | Before launch? | Owner |
|---|---|---|---|---|
| 1 | No canister tests | Ready: integration tests in CI (#53) | Done | Claude |
| 2 | Per-user queries scan whole tables; nothing is pruned | Ready: indexes (#53), answer keys dropped 7 days after a session finishes (#61), exam sessions kept 12 months (Mete, 2026-11-19) | Done | Claude |
| 3 | Same cert exam on every attempt | Ready: fixed in #53 | Done | Claude |
| 4 | Client chains multi-canister writes | Ready: `exam` pushes finished results to ranking, question and user with retries (#61) | Done | Claude |
| 5 | 3 update calls per answered question (1 to 2 s reveal latency on mainnet) | Ready: one call per answer (#61) | Done | Claude |
| 6 | Hand-written IDLs, no drift check; shared types copied into 4 canisters | Ready: generated Candid and bindings with a CI drift check, `backend/lib/Types.mo` (#61) | Done | Claude |
| 7 | API types double as stored types; ranking trusts client name/state | Ready: ranking reads the user canister (#61); stored types split from API types for sessions, profiles and stats (Mete chose before launch, 2026-11-19) | Done | Claude |
| 8 | 114 silent `.catch(() => …)`, no error boundary | Error boundary (#54), offline queue no longer sticks, `useCanisterQuery` + `LoadError` (#61); 76 silent catches left to convert as pages are touched | Done for launch | Claude |
| 9 | One 958 kB bundle, no code splitting; N+1 offline sync | Ready: route splitting (527 kB main bundle), one-call plays sync, paged question sync (#61) | Done | Claude |
| 10 | Badges UI dropped; "ELO" is a fixed ±16 | Badges back (#54); rating weighted by question difficulty (Mete, 2026-11-19) | Done | Claude |
| 11 | Large page components, `.gitlab-ci.yml` drift | GitLab file deleted (Mete, 2026-11-19); `with` updates (#61); split pages as they are touched | After launch for page splits | Claude |

Known gaps from the security audit (#51) that Mete accepted: practice mode still shows answers, players can abandon a bad ranked quiz, and practice-mode streak and badge counters are client-reported (graded sessions are counted by the exam canister since #61).

## 7. Mobile (Android and iOS are part of the launch)

The apps wrap the same React build with Capacitor (`frontend/capacitor.config.ts`, app ID `app.officialiq.study`). There is no separate native codebase. Setup steps and every secret: `docs/MOBILE.md`.

| Item | Status | Owner |
|---|---|---|
| Android project (`frontend/android`) | Ready: built on every frontend PR (`mobile-ci.yml`) | Claude |
| iOS project (`frontend/ios`) | Ready: added, built for the simulator on GitHub's macOS runners on every frontend PR (`mobile-ci.yml`) | Claude |
| Sign-in inside the app: Internet Identity opens a pop-up window and returns by `postMessage`, which an app web view doesn't support | Ready in code: II's redirect transport (ICRC-167) through the system browser, returning on a verified App Link / associated domain (`src/lib/nativeAuth.ts`). Same principal as the website. **Not yet tested on a phone**: needs production, the team ID and signing fingerprints (`docs/MOBILE.md`) | Claude (built), Mete (device test) |
| Canister IDs baked into the app at build time (the app gets no `ic_env` cookie) | Ready in code: the release workflow builds against `.icp/data/mappings/ic.ids.json`, so it waits for the first production deploy | Claude (automatic) |
| Android build and signing in GitHub Actions: Gradle builds a signed release bundle (`.aab`) and uploads it to Play's internal testing track | Ready in code (`mobile-release.yml`); skips until the secrets exist. The first bundle goes up by hand from the run's artifact | Claude (workflow), Mete (secrets below) |
| iOS build and signing in GitHub Actions: a macOS runner archives with Xcode's automatic (cloud-managed) signing and uploads to TestFlight. No fastlane or certificate repo needed | Ready in code (`mobile-release.yml`); skips until the secrets exist | Claude (workflow), Mete (secrets below) |
| Google Play developer account ($25 one-time) | Not ready | Mete |
| Apple Developer Program ($99/yr) | Not ready | Mete |
| Android upload keystore and its passwords as repo secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`); one `keytool` command in `docs/MOBILE.md` | Not ready | Mete |
| Play service-account JSON for uploads (`PLAY_SERVICE_ACCOUNT_JSON`), and both SHA-256 fingerprints from Play's App integrity page as the `ANDROID_CERT_SHA256` variable (for the App Link) | Not ready | Mete |
| App Store Connect API key with the Admin role (`APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_P8`), the `APPLE_TEAM_ID` variable, and the app record for `app.officialiq.study` | Not ready | Mete |
| Native push: Firebase for Android, an APNs key for iOS | Sending wired (relay talks to APNs and FCM directly), iOS entitlement and token hand-off added. Not ready: Mete creates the Firebase project and APNs key and sets the secrets in `docs/MOBILE.md` → "Push notifications", then `FEATURE_NATIVE_PUSH` | Mete |
| App icons and splash screens for both platforms | Not ready: Claude can generate them from one source image with `@capacitor/assets` | Mete (source art), Claude |
| Store listings: description, screenshots, privacy policy URL, Play data-safety form, App Store privacy labels, push permission reason | Not ready | Mete (text, forms), Claude (screenshots, draft copy) |
| Apple review risk: apps that only wrap a website can be rejected (guideline 4.2). Offline study, native push and share help make the case | Watch | Mete |
| Version numbering: `versionCode` / build number bumped by the release workflow | Ready: the run number, with the version name as a workflow input | Claude |

HomeGentic's mobile pipeline is built on Expo/EAS, which doesn't apply to Capacitor. Its shape carries over: CI builds on every PR, a release workflow that skips until secrets exist, internal track and TestFlight first, manual promotion to production.

## 8. Launch-day checks

Once staging is up, run these on staging, then again on production after the manual deploy:

- [ ] Sign in, pick sport and level, profile saves (Mete)
- [ ] Sign in on the Android and iOS test builds (Play internal testing, TestFlight); the principal matches the website's (Mete)
- [ ] Ranked quiz: questions vary between attempts, result shows on the leaderboard (Mete)
- [ ] Cert exam: graded on the canister, appears in exam history (Mete)
- [ ] Challenge: send, accept, result within the 72h window (Mete, needs two accounts)
- [ ] Association "most missed" view loads (Mete)
- [ ] Spanish UI spot-check by a native speaker (Mete)
- [ ] Push notification arrives for a streak milestone, on the website and on each phone (Mete)
- [ ] Report a question from a quiz; it shows on Me → Moderation Queue and can be resolved (Mete)
- [ ] Delete a throwaway account; within a few minutes it's off the leaderboards and its groups are gone, and the same Internet Identity can sign up again (Mete)
- [ ] Cycle watchdog run is green and every canister has a 90-day freezing threshold (Claude reads the workflow results)
