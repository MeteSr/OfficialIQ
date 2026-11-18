# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

```bash
make dev        # deploy all canisters + start Vite dev server
make start      # icp network start -d (project-local network, :8000)
make deploy     # bash scripts/deploy.sh local
make frontend   # cd frontend && npm run dev (Vite at :5173)
make clean      # reset local network state
make status     # show canister status
```

Tooling is icp-cli (`icp`, config in `icp.yaml`) and mops (`mops.toml`) —
never dfx. Follow DFINITY's ICP skills (https://skills.internetcomputer.org);
they win over older patterns in this file or the code. The weekly
"ICP freshness" workflow flags when they or the toolchain move on.

## Architecture

### Canister Map (10 canisters + frontend)

| Canister   | Responsibility |
|------------|----------------|
| **user**      | Profiles, roles (Official / Assessor / Admin), sport + level |
| **content**   | Rule articles, casebook plays; keyed by `sportId:artN` |
| **question**  | MCQ bank; `sampleQuiz()` returns filtered question sets |
| **exam**      | Generated exam sessions, share tokens, answer submission |
| **ranking**   | ELO-based leaderboard (Friends / State / National), streak tracking |
| **challenge** | Peer challenge send/accept/result with 72h TTL |
| **ai_proxy**  | IC HTTP outcalls for ElevenLabs TTS and future AI features |
| **mentorship**  | Mentor links, shared exam answer snapshots, mentor annotations |
| **association** | Officiating associations, join codes, coordinator-assigned study assignments |
| **report**      | Shareable performance report cards |
| **frontend**  | Serves frontend/dist (`@dfinity/static-site`, certified assets; `_headers` / `_redirects` in frontend/public) |

All canisters use `persistent actor` — all variables are implicitly stable.
Use `mo:core` (never `mo:base`), `.values()` (not `.vals()`), and the `ic`
mops package's `Call.httpRequest` builder for HTTPS outcalls.
Each exports a `metrics()` query.

### Sport + Level keying

Content and questions are always keyed by `sportId` (e.g. `ncaa_basketball`) and `levelId` (e.g. `varsity`). Queries always pass both so the platform is sport-agnostic.

### Frontend

React + TypeScript + Vite. Mobile-first, max-width 430px centered layout.

Design tokens in `frontend/src/tokens.ts`:
```typescript
navy:  "#1D428A"   // primary surface, nav, buttons
red:   "#C8102E"   // accent: active state, streak, CTAs
white: "#FFFFFF"
bg:    "#F4F5F7"
```

No CSS framework — all inline React styles using the `T` token object.
No border-radius above 12px.

Routes: `/home`, `/study`, `/exam`, `/ranks`, `/me`, `/quiz/:articleId`

### Canister IDs

`icp deploy` injects `PUBLIC_CANISTER_ID:<name>` into every canister; the
frontend reads them and the root key from the `ic_env` cookie via
`canisterId(name)` in `frontend/src/lib/icEnv.ts` (build-time fallback for
the Capacitor app). Never call `fetchRootKey()`. Mainnet IDs live in
`.icp/data/mappings/<env>.ids.json` and must be committed.

### Stub data pattern

Pages use local stub constants (e.g. `STUB_QUESTIONS`, `STUB_ENTRIES`) while canister integration is pending. Replace with service layer calls once canisters are deployed.

## IDL maintenance

Whenever you add or rename a Motoko type, update the matching IDL in `frontend/src/declarations/<canister>/index.ts` (create the file if it doesn't exist yet). `mops generate candid <canister>` prints the canister's current Candid interface to compare against.
