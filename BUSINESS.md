# Outstanding Business Requirements

This tracks work OfficialIQ needs that **engineering cannot complete on its own** — licensing, partnerships, paid accounts, and other business/administrative tasks. Everything listed here has a corresponding GitHub issue with the full technical context; this file is the plain-language summary for non-engineering follow-up.

Engineering has consistently built the full technical pipeline for each of these and stopped at the point where a real license, account, or agreement is required — nothing below is blocked by missing code.

## 1. Rulebook content licensing (highest priority)

The entire product is a rules study tool, so this is the most fundamental gap.

- **NCAA Men's Basketball** (the current, only fully-seeded sport): the content in the app today was authored for development and has **not been cleared against real NCAA rulebook usage rights**. This needs to be verified/licensed before the product can legally launch to real users. *(Issue #1)*
- **FIBA Basketball, FIFA Football, World Rugby**: these three sports are registered in the app's sport list to prove the architecture supports them, but ship with **zero rules content**. Real launch of any of these requires licensing/sourcing the actual rulebooks (FIBA Basketball Rules, FIFA Laws of the Game, World Rugby Laws) from their governing bodies. *(Issue #32)*

**Ask:** legal/licensing conversation with NCAA (and, if we want to launch international sports, FIBA/FIFA/World Rugby) about rulebook usage rights for a commercial study/certification product.

## 2. Case-play video clips

The video playback system (player, watch-through gating, community submission, moderation queue) is fully built, but **no actual video clips are loaded** — there's nothing to license or produce yet.

**Ask:** either (a) license 20+ short game-footage clips with confirmed usage rights, (b) film/produce practice scenarios with proper releases, or (c) find a vendor who can supply pre-cleared clips. Once clips exist, hosting and wiring them in is a small engineering task. *(Issue #29)*

## 3. Assigning-platform partnerships (ArbiterSports, RefTown, etc.)

Officials can already manually link an account and enter games by hand. Automatic schedule sync isn't possible because **these platforms don't currently offer a public API** — as of this writing that's confirmed for ArbiterSports specifically.

**Ask:** business development outreach to ArbiterSports/RefTown (or similar assigning platforms) to establish an API partnership. The manual-entry path stays as a permanent fallback either way. *(Issue #30)*

## 4. App store distribution (iOS + Android)

The Capacitor wrapper, Android build scaffolding, and native push plugin wiring are done. What's left needs real accounts and, for iOS specifically, different hardware than what engineering has access to:

- **Apple Developer Program account** ($99/yr) — also required before an iOS build can even be produced (Apple's tooling requires macOS, which isn't available in the current dev environment)
- **Google Play Developer account** ($25 one-time)
- Store listing requirements once accounts exist: privacy policy, data-safety form, app icon/screenshots, permissions justification for push notifications

**Ask:** decide whether native app store distribution is a near-term priority; if so, set up both developer accounts (and, for iOS, either a Mac or a CI service like a hosted macOS build runner). *(Issue #31)*

## 5. Translation quality (French, Portuguese)

Spanish is fully wired end-to-end. French and Portuguese are intentionally **not offered yet** — shipping machine-translated rules/UI text in a study tool for a certification exam risks real inaccuracies, so this was deliberately held back rather than shipped speculatively.

**Ask:** budget for a native-speaker or professional translation review before French/Portuguese are added. Also note item #1 above — Spanish UI text is done, but Spanish/other-language *rulebook content* is still gated on the same licensing question. *(Issue #32)*

## 6. Paid third-party API accounts (needed for production, not local dev)

Two AI-powered features work today but run on a developer's personal/test API key locally. Production needs funded, production-tier accounts:

- **Anthropic (Claude) API** — powers the natural-language rule assistant and personalized scenario generation
- **ElevenLabs API** — powers audiobook/TTS narration of rules and casebook content

**Ask:** set up billed production accounts for both and decide who owns the ongoing usage cost (both are pay-per-use).

## 7. Production hosting decisions

- **Internet Computer mainnet deployment**: everything currently runs on a local developer replica. Deploying to IC mainnet for real users requires acquiring and funding **cycles** (ICP's on-chain compute/storage payment) — this has an ongoing cost, not just a one-time setup.
- **Push notification relay**: the streak-milestone push system works end-to-end, but the piece that actually sends notifications (`scripts/send-pending-push.mjs`) needs to run continuously somewhere in production (a small scheduled job/server) with production VAPID keys — this needs a hosting decision, not new engineering.

**Ask:** decide on a mainnet deployment budget/timeline and where small always-on scripts like the push relay will run (a cheap scheduled cloud function is enough).

---

*Each section above links to a GitHub issue with full technical detail for engineering's reference. This file should be updated as these are resolved or as new business-only blockers are discovered.*
