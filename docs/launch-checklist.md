# Q3 launch readiness checklist

State of `main` at `e973c23` (PR #53 merged), checked on 2026-11-18.
Every line is **Ready** or **Not ready**, with an owner: **Mete** for
accounts, money, licences, settings and decisions; **Claude** for code,
CI and docs. Update a line when it changes, rather than adding a new one.

## Launch blockers (short version)

Nothing below is blocked on code. The app can't go live until these are done:

1. **Mete:** fund the deploy identity with cycles and set `ICP_IDENTITY_PEM` on the `staging` environment. Staging has never deployed: every "Deploy (staging)" run so far, including the one for #53, stopped at "Skip until the deploy identity is configured".
2. **Mete:** confirm the rights to the NCAA rules content, or replace it with licensed text. The seed data says it was written from scratch for development (`frontend/scripts/seedData.mjs`, issue #1).
3. **Mete + Claude:** run the staging smoke test (ranked quiz, cert exam, challenge) once staging is up.
4. **Mete:** set up the production accounts and keys: a spend-capped Anthropic key, VAPID keys and the push relay identity.
5. **Mete + Claude:** ship Android and iOS. Mete opens the Apple and Google developer accounts; Claude adds the iOS project, fixes sign-in inside the app, and builds the release workflows (§7).

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
| Audio / TTS narration | `scripts/generate-audio.sh` with ElevenLabs | Not ready: needs a production ElevenLabs account (BUSINESS.md #6) | Mete |
| Push notifications (streak milestones) | Web Push, `push-relay.yml` every 15 min | Not ready: needs keys and relay identity (§4) | Mete |
| Spanish UI | Full coverage, enforced by `i18n/coverage.test.ts` (#49) | Ready in code; **native-speaker review pending** | Mete |
| Landing page | Merged in #34 | Ready | Claude |
| Installable PWA | Service worker, offline queue | Ready | Claude |

## 2. Stubbed or missing

| Item | Where | Status | Owner |
|---|---|---|---|
| Monthly quiz "days left" is hardcoded to 4 | `HomePage.tsx` `MONTHLY_DAYS_LEFT_STUB` | Not ready | Claude |
| Weekly quiz "agree %" is hardcoded to 68% | `WeeklyQuizPage.tsx` `AGREE_PCT_STUB` | Not ready | Claude |
| Services fall back to stub data when a canister ID is missing | `frontend/src/lib/icEnv.ts` | Ready (only affects dev builds; staging smoke test confirms) | Claude |
| Case-play video clips | Player and moderation queue built, no clips (issue #29) | Not ready; can launch without, hide the entry point | Mete |
| Badges UI | Dropped in the design handoff; fetch removed in #53. Mete decided 2026-11-18 to bring them back on the Me page | Not ready | Claude |
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
| Seeding content and setting the AI config run only from a local machine as the deploy identity | Not ready: add `seed-content` and `set-ai-config` to the Admin task workflow so no local commands are needed | Claude |
| Open Dependabot PRs (#37 to #39, #41 to #46, #48, #52), including majors for TypeScript 7, vitest 5, i18next 27, web-push 4 | Not ready: triage before launch, majors need checking | Claude |
| `.gitlab-ci.yml` duplicates the pipeline (review finding 11) | Not ready: delete unless a GitLab move is planned | Claude |

**Note on secrets:** icp-cli has no cycles wallet, so there is no wallet ID secret to set. Deploys spend from the identity's cycles-ledger balance.

## 4. Production accounts, keys and settings

| Item | Status | Owner |
|---|---|---|
| Spend-capped Anthropic key in a dedicated Console workspace (`docs/DEPLOYMENT.md` §7) | Not ready | Mete |
| ElevenLabs production account | Not ready | Mete |
| `PUSH_RELAY_IDENTITY_PEM` secret, then Admin task `set-push-relay` | Not ready | Mete |
| `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` secrets | Not ready | Mete |
| Decide whether the GitHub Actions push relay is permanent | Not ready | Mete |
| Grant coordinator roles with Admin task `set-role` | Not ready (after deploy) | Mete |
| Claim app admin with the deploy identity (first admin script run) | Not ready (after deploy) | Mete, or Claude once the Admin task can seed |

## 5. Content and legal

| Item | Status | Owner |
|---|---|---|
| NCAA Men's Basketball content cleared for commercial use (issue #1, BUSINESS.md #1) | **Not ready, launch blocker** | Mete |
| FIBA / FIFA / World Rugby content (issue #50): needs licensed rulebooks; Claude won't write rules text without them | Not ready; launch can go NCAA-only if these sports are hidden | Mete |
| NFHS Basketball is registered with no content | Not ready: hide empty sports at launch | Claude |
| Privacy policy and terms pages (none in the app today; both stores require a privacy policy URL) | Not ready | Mete (text), Claude (pages) |

## 6. Quality and review findings

From the engineering review ([doc](https://claude.ai/artifact/G4rXTTcTA2JB9Cd5egHcgW)), ranked by impact. "Before launch" marks the ones worth doing before real users arrive.

| # | Finding | Status | Before launch? | Owner |
|---|---|---|---|---|
| 1 | No canister tests | Ready: integration tests in CI (#53) | Done | Claude |
| 2 | Per-user queries scan whole tables; nothing is pruned | Indexes added in #53; session and answer-key pruning still open | Pruning can wait for growth | Claude |
| 3 | Same cert exam on every attempt | Ready: fixed in #53 | Done | Claude |
| 4 | Client chains multi-canister writes | Claims retried since #53; server-side push from `exam` still open | Recommended | Claude |
| 5 | 3 update calls per answered question (1 to 2 s reveal latency on mainnet) | Not ready | Recommended: users feel it | Claude |
| 6 | Hand-written IDLs, no drift check; shared types copied into 4 canisters | Not ready | Recommended | Claude |
| 7 | API types double as stored types; ranking trusts client name/state | Not ready | After launch | Claude |
| 8 | 114 silent `.catch(() => …)`, no error boundary | Not ready | **Yes**: one bad render blanks the app | Claude |
| 9 | One 958 kB bundle, no code splitting; N+1 offline sync | Not ready | Recommended for a mobile PWA | Claude |
| 10 | Badges UI dropped; "ELO" is a fixed ±16 | Badges coming back (Mete, 2026-11-18); rating formula still open | Badges yes; rating after launch | Claude |
| 11 | Large page components, `.gitlab-ci.yml` drift | Not ready | After launch (GitLab file in §3) | Claude |

Known gaps from the security audit (#51) that Mete accepted: practice mode still shows answers, players can abandon a bad ranked quiz, and streak and badge counters are client-reported.

## 7. Mobile (Android and iOS are part of the launch)

The apps wrap the same React build with Capacitor (`frontend/capacitor.config.ts`, app ID `app.officialiq.study`). There is no separate native codebase.

| Item | Status | Owner |
|---|---|---|
| Android project (`frontend/android`) | Ready in code; never built in CI | Claude |
| iOS project (`frontend/ios`) | **Missing**: add `@capacitor/ios` and generate it with `npx cap add ios` (no Mac needed to generate, only to build) | Claude |
| Sign-in inside the app: Internet Identity opens a pop-up window and returns by `postMessage`, which an app web view doesn't support | **Not ready, likely blocker**: needs a native flow (system browser plus a deep link back into the app). Verify on a device first | Claude |
| Canister IDs baked into the app at build time (the app gets no `ic_env` cookie) | Not ready: needs mainnet IDs, so it waits for the first production deploy | Claude |
| Android build and signing in GitHub Actions: Gradle builds a signed release bundle (`.aab`) and uploads it to Play's internal testing track | Not ready | Claude (workflow), Mete (secrets below) |
| iOS build and signing in GitHub Actions: a macOS runner builds with Xcode, signs with fastlane, uploads to TestFlight | Not ready | Claude (workflow), Mete (secrets below) |
| Google Play developer account ($25 one-time) | Not ready | Mete |
| Apple Developer Program ($99/yr) | Not ready | Mete |
| Android upload keystore, and its passwords as repo secrets (Claude can generate it in a workflow if you prefer) | Not ready | Mete |
| Play service-account JSON for uploads, as a repo secret | Not ready | Mete |
| App Store Connect API key (issuer ID, key ID, `.p8`) as repo secrets; fastlane match manages certificates and profiles from it | Not ready | Mete |
| Native push: Firebase project (`google-services.json`) for Android, APNs key for iOS. The relay currently skips native tokens (`send-pending-push.mjs`) | Not ready: Mete creates the accounts, Claude wires the sending | Mete, Claude |
| App icons and splash screens for both platforms | Not ready: Claude can generate them from one source image with `@capacitor/assets` | Mete (source art), Claude |
| Store listings: description, screenshots, privacy policy URL, Play data-safety form, App Store privacy labels, push permission reason | Not ready | Mete (text, forms), Claude (screenshots, draft copy) |
| Apple review risk: apps that only wrap a website can be rejected (guideline 4.2). Offline study, native push and share help make the case | Watch | Mete |
| Version numbering: `versionCode` / build number bumped by the release workflow | Not ready | Claude |

HomeGentic's mobile pipeline is built on Expo/EAS, which doesn't apply to Capacitor. Its shape (CI builds, internal track and TestFlight first, manual promotion to production) still carries over.

## 8. Launch-day checks

Once staging is up, run these on staging, then again on production after the manual deploy:

- [ ] Sign in, pick sport and level, profile saves (Mete)
- [ ] Ranked quiz: questions vary between attempts, result shows on the leaderboard (Mete)
- [ ] Cert exam: graded on the canister, appears in exam history (Mete)
- [ ] Challenge: send, accept, result within the 72h window (Mete, needs two accounts)
- [ ] Association "most missed" view loads (Mete)
- [ ] Spanish UI spot-check by a native speaker (Mete)
- [ ] Push notification arrives for a streak milestone (Mete)
- [ ] Cycle watchdog run is green and every canister has a 90-day freezing threshold (Claude reads the workflow results)
