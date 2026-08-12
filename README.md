# OfficialIQ

A mobile-first study and certification platform for sports officials (referees/umpires), built entirely on the Internet Computer (ICP). Officials study rule articles and casebook plays, drill with question banks, take generated exams, track ELO-based rankings, and get matched with mentors and their local association — all backed by Motoko canisters, no traditional server.

## Architecture

**Backend:** 10 Motoko canisters + a static asset canister, all `persistent actor`s (implicitly stable state — no manual stable-var plumbing).

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
| `assets`       | Serves the built `frontend/dist` |

Every canister exports a `metrics()` query for basic observability.

**Frontend:** React + TypeScript + Vite, mobile-first with a 430px-max-width centered layout, no CSS framework (inline styles driven by the token set in `frontend/src/tokens.ts`). Ships as an installable PWA (service worker in `frontend/src/sw.ts`, Web Push support) and can be wrapped with Capacitor for Android.

**Content model:** all content and questions are keyed by `sportId` (e.g. `ncaa_basketball`) and `levelId` (e.g. `varsity`), so the platform is sport-agnostic by construction.

## Prerequisites

- [dfx](https://internetcomputer.org/docs/current/developer-docs/getting-started/install) (the DFINITY Canister SDK)
- Node.js + npm

## Getting started

```bash
make dev        # deploy all canisters + start the Vite dev server
```

Other useful targets:

```bash
make start      # dfx start --background (network only)
make deploy     # bash scripts/deploy.sh local
make frontend   # cd frontend && npm run dev  (Vite at :5173)
make clean      # reset local dfx state
make status     # show canister status
make cycles     # show remaining cycles per canister (local)
```

Canister IDs are written to `.env` by `scripts/deploy.sh` and read into the frontend at build time via `vite.config.ts`.

## Deploying beyond local

`make deploy-staging` / `make deploy-ic` deploy to a real IC network (a
second canister set used as staging, and production mainnet, respectively —
see `dfx.json`'s `staging`/`ic` network entries). Both require a funded
cycles wallet first; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the
one-time identity/wallet setup, the CI pipeline (`.github/workflows/`), and
canister-upgrade safety notes.

None of this is tied to GitHub specifically — `scripts/*.sh` hold all the
actual logic, and the GitHub Actions workflows are thin wrappers around
them. See [docs/DEPLOYMENT.md § Deploying without GitHub](docs/DEPLOYMENT.md#deploying-without-github)
for a Docker image, a GitLab CI example, and self-hosted systemd units that
do the same thing with no GitHub involvement at all.

## Repo layout

```
backend/    Motoko canisters, one directory per canister (main.mo)
frontend/   React + TypeScript app (Vite)
scripts/    deploy, content seeding, audio generation, push relay
tests/      end-to-end / integration tests
docs/       deployment and other operational docs
.github/    CI workflows (staging/production deploy, push relay)
docker/     portable deploy container (GitHub-free CI/hosts)
deploy/     self-hosted systemd units (GitHub-free push relay)
dfx.json    canister definitions
Makefile    common dev commands
```

See [CLAUDE.md](CLAUDE.md) for detailed conventions (IDL maintenance, design tokens, stub-data pattern, etc.) used when developing this project with Claude Code.
