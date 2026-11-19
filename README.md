# OfficialIQ

A mobile-first study and certification platform for sports officials (referees/umpires), built entirely on the Internet Computer (ICP). Officials study rule articles and casebook plays, drill with question banks, take generated exams, track ELO-based rankings, and get matched with mentors and their local association — all backed by Motoko canisters, no traditional server.

## Architecture

**Backend:** 10 Motoko canisters + a certified-assets frontend canister, all `persistent actor`s (implicitly stable state — no manual stable-var plumbing).

| Canister       | Responsibility |
|----------------|----------------|
| `user`         | Profiles, roles (Official / Assessor / Admin), sport + level, linked accounts, upcoming games, push subscriptions |
| `content`      | Rule articles and casebook plays, keyed by `sportId:artN`, with per-article language variants |
| `question`     | MCQ bank; `sampleQuiz()` returns filtered question sets; tracks per-question answer history |
| `exam`         | Generated exam sessions, share tokens, answer submission |
| `ranking`      | ELO-based leaderboard (Friends / State / National), streak tracking, push-milestone queueing |
| `challenge`    | Peer challenge send/accept/result with a 72h TTL |
| `ai_proxy`     | IC HTTP outcalls for ElevenLabs TTS, Claude-powered drills, and other AI features |
| `mentorship`   | Mentor links, shared exam answer snapshots, mentor annotations |
| `association`  | Officiating associations, join codes, coordinator-assigned study assignments, completion tracking |
| `report`       | Shareable performance report cards (public link or shared-with-coordinator) |
| `frontend`     | Serves the built `frontend/dist` (`@dfinity/static-site`, certified assets) |

Every canister exports a `metrics()` query for basic observability.

**Frontend:** React + TypeScript + Vite, mobile-first with a 430px-max-width centered layout, no CSS framework (inline styles driven by the token set in `frontend/src/tokens.ts`). Ships as an installable PWA (service worker in `frontend/src/sw.ts`, Web Push support) and can be wrapped with Capacitor for Android.

**Content model:** all content and questions are keyed by `sportId` (e.g. `ncaa_basketball`) and `levelId` (e.g. `varsity`), so the platform is sport-agnostic by construction.

## Prerequisites

- Node.js 22+ and npm
- [icp-cli](https://cli.internetcomputer.org), ic-wasm and mops:
  `npm install -g @icp-sdk/icp-cli @icp-sdk/ic-wasm ic-mops`
  (CI installs the versions pinned in `tools/package.json` via `scripts/install-icp.sh`)

## Getting started

```bash
make dev        # deploy all canisters + start the Vite dev server
```

Other useful targets:

```bash
make start      # icp network start -d (project-local network at :8000)
make deploy     # bash scripts/deploy.sh local
make frontend   # cd frontend && npm run dev  (Vite at :5173)
make clean      # reset the local network's state
make status     # show canister status
make cycles     # show remaining cycles per canister (local)
```

There is no `.env` with canister IDs: `icp deploy` injects them into the canisters, and the frontend reads them (plus the network's root key) from the `ic_env` cookie — set by the frontend canister, or by `vite dev` from the local network. See `frontend/src/lib/icEnv.ts`.

The admin scripts (`scripts/seed-content.sh`, `set-ai-config.sh`, …) run as your active icp identity, which must be the one that deployed (only a controller can claim app admin). Locally that means a named identity rather than the default anonymous one:

```bash
icp identity new dev && icp identity default dev
make deploy && bash scripts/seed-content.sh
```

## Deploying beyond local

`make deploy-staging` / `make deploy-ic` deploy to IC mainnet (a second
canister set used as staging, and production, respectively — see
`icp.yaml`'s `staging` environment; `ic` is built in). Both need an identity
holding cycles first; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the
one-time identity/funding setup, the CI pipeline (`.github/workflows/`), and
canister-upgrade safety notes.

None of this is tied to GitHub specifically — `scripts/*.sh` hold all the
actual logic, and the GitHub Actions workflows are thin wrappers around
them. See [docs/DEPLOYMENT.md § Deploying without GitHub](docs/DEPLOYMENT.md#deploying-without-github)
for a Docker image and self-hosted systemd units that
do the same thing with no GitHub involvement at all.

## Repo layout

```
backend/    Motoko canisters, one directory per canister (main.mo)
frontend/   React + TypeScript app (Vite)
scripts/    deploy, content seeding, audio generation, push relay
tools/      pinned icp-cli / ic-wasm / mops versions for CI
tests/      end-to-end / integration tests
docs/       deployment and other operational docs
.github/    CI workflows (staging/production deploy, push relay)
docker/     portable deploy container (GitHub-free CI/hosts)
deploy/     self-hosted systemd units (GitHub-free push relay)
icp.yaml    canisters and environments (icp-cli)
mops.toml   Motoko compiler, dependencies, canister entry points
Makefile    common dev commands
```

See [CLAUDE.md](CLAUDE.md) for detailed conventions (IDL maintenance, design tokens, stub-data pattern, etc.) used when developing this project with Claude Code.
