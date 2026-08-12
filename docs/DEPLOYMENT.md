# Deployment

This covers deploying OfficialIQ beyond the local dfx replica: staging (a
second canister set on IC mainnet) and production (the `ic` network, real
IC mainnet). See issue #33 for the full pipeline design and `BUSINESS.md`
#7 for the business-side asks this depends on (cycles funding, push-relay
hosting decision).

**Nothing here works until the funding/account steps in `BUSINESS.md` #7
are done.** Everything in this doc and the CI workflows is built and ready
to go the moment that funding exists — that's the point of doing it now
rather than later.

## Why "staging" instead of a real testnet

The Internet Computer doesn't have an official public testnet the way many
other chains do. The practical equivalent used here is a **second,
separately-funded canister set deployed to IC mainnet** — same network,
isolated canister IDs and data, cheap to run since it only needs to hold a
small cycles buffer. `dfx.json` declares this as a `staging` network
alongside `local` and `ic`.

## One-time setup

### 1. Create a dedicated deploy identity

Don't reuse a developer's personal dfx identity for CI. Create one specifically
for automated deploys:

```bash
dfx identity new ci-deploy --storage-mode plaintext
dfx identity use ci-deploy
dfx identity export ci-deploy > ci-deploy.pem   # keep this out of git
```

`ci-deploy.pem`'s contents become the `DFX_IDENTITY_PEM` repo secret (Settings →
Secrets and variables → Actions). Never commit this file — delete the local
copy once it's in GitHub Secrets.

### 2. Create and fund a cycles wallet (per network)

```bash
dfx identity use ci-deploy
dfx ledger create-canister <ci-deploy-principal> --amount <ICP amount> --network staging
dfx identity deploy-wallet <wallet-canister-id> --network staging
```

Repeat for `--network ic` once staging is validated. This is the actual
funding step tracked in `BUSINESS.md` #7 — someone needs to acquire ICP and
convert it to cycles. `scripts/deploy.sh` refuses to run against a
non-local network without a configured, funded wallet, so there's no risk
of a half-finished deploy from skipping this.

### 3. Set repo secrets

| Secret | Used by | Notes |
|---|---|---|
| `DFX_IDENTITY_PEM` | `deploy-staging.yml`, `deploy-production.yml`, `push-relay.yml` | PEM export from step 1 |
| `VAPID_PRIVATE_KEY` | `push-relay.yml` | `npx --prefix frontend web-push generate-vapid-keys` |
| `VAPID_PUBLIC_KEY` | `push-relay.yml` | Same command; also build-injected as `VITE_VAPID_PUBLIC_KEY` (not secret) |
| `VAPID_SUBJECT` | `push-relay.yml` | `mailto:` address for push service abuse contact |

### 4. Configure GitHub Environments (optional but recommended)

Both deploy workflows run under `environment: staging` / `environment: production`.
Creating those environments in repo Settings → Environments lets you add
required reviewers on `production` specifically, so a mainnet deploy needs a
human approval click even though the tag-push trigger is automatic.

## Day-to-day usage

- **Staging** deploys automatically on every push to `main` that touches
  backend/frontend/deploy-script paths (`deploy-staging.yml`).
- **Production** deploys only on a version tag push (`v*.*.*`) or manual
  dispatch (`deploy-production.yml`) — never automatically from `main`.
- **Push relay** runs every 15 minutes against `ic` once secrets exist
  (`push-relay.yml`). Swap this for a different always-on host if that's
  what gets decided for `BUSINESS.md` #7 — the workflow is just one valid
  answer, not the only one.

Manual deploys work the same way locally once your dfx identity has the
`ci-deploy` wallet's cycles (or your own):

```bash
bash scripts/deploy.sh staging          # full deploy
bash scripts/deploy.sh staging assets-only   # frontend-only fix, skips backend canisters
bash scripts/check-cycles.sh staging    # see remaining balance per canister
```

## canister_ids.json

Local/ephemeral canister IDs live under `.dfx/` (gitignored, regenerated
per developer). Real-network IDs (`staging`, `ic`) are written to
`canister_ids.json` at the repo root, which is **meant to be committed** —
those IDs are permanent for the life of the canister. The CI workflows
commit this file automatically after a staging deploy; production deploys
only warn if it changed, since auto-pushing to `main` from a tag build is
riskier than it's worth for a file that should only change once per new
canister (see the workflow's comments).

## Canister upgrades and rollback safety

`dfx deploy` upgrades canisters in place by default — this is safe for most
changes because all canister state is declared with `stable` vars (see
`CLAUDE.md`: "all canisters use `persistent actor`"). Before deploying a
change that **removes or changes the type of** a stable variable:

1. Deploy the change to `staging` first and confirm `dfx canister status`
   afterward shows no unexpected size drop.
2. If a stable-variable migration is genuinely needed, write the migration
   logic explicitly in the canister's `main.mo` (a `pre_upgrade`/
   `post_upgrade`-adjacent pattern) rather than relying on dfx to guess —
   Motoko will refuse to compile an unsafe stable-var change, but it's still
   worth rehearsing on staging before production.
3. Assets can always be redeployed independently
   (`scripts/deploy.sh <network> assets-only`) without touching backend
   canister state, for frontend-only fixes.

## Custom domain

Not yet decided — this needs a domain name choice (business decision, not
tracked in `BUSINESS.md` today; add it there if/when this becomes a
priority). Once one exists, the IC-side steps are:

1. Add a `.well-known/ic-domains` file (in `frontend/public/`, same
   passthrough mechanism as `.ic-assets.json5`) listing the domain.
2. Add a DNS `CNAME` for the domain → `icp1.io`, and a `TXT` record at
   `_canister-id.<domain>` with the `assets` canister's ID.
3. Register the domain with the boundary nodes per the current IC docs (this
   step has changed over time — check `internetcomputer.org` docs at
   implementation time rather than trusting a fixed set of instructions here).

## Verifying dfx CLI details

The exact flags for `dfx identity import` (`--storage-mode`), `dfx wallet
balance --precise` output format, and the dfx installer script referenced
in the workflows are all accurate as of when this was written, but dfx's
CLI has changed across versions before. Run `dfx --version` and skim
`dfx identity import --help` / `dfx wallet balance --help` the first time
you run any of this for real, before assuming the workflows will work
unmodified.
