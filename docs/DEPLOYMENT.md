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

## Deploying without GitHub

Every piece of actual deploy logic lives in `scripts/*.sh` — plain bash,
called with plain environment variables. `.github/workflows/*.yml` are thin
wrappers that install dfx, set an env var from a GitHub Secret, and call
those scripts; **nothing about the deploy process itself depends on
GitHub.** This section covers the alternatives, for anyone who wants to
self-host CI, avoid GitHub Actions specifically, or just deploy by hand.

| I want to... | Use |
|---|---|
| Deploy once, right now, from my own machine | The manual path below — no extra tooling |
| Run CI on GitLab instead of GitHub | `.gitlab-ci.yml` (repo root) |
| Run CI/deploys identically on any Docker-capable host | `docker/deploy.Dockerfile` |
| Run the push relay on a self-hosted box, no CI at all | `deploy/systemd/officialiq-push-relay.{service,timer}` |

### Manual (no CI, no Docker, no GitHub)

This is the simplest GitHub-free path and doesn't require setting up
anything beyond dfx itself:

```bash
dfx identity use ci-deploy       # or whichever identity holds the wallet
bash scripts/deploy.sh staging   # or: ic
bash scripts/check-cycles.sh staging
```

The identity's private key stays in dfx's own local keyring
(`~/.config/dfx/identity/`, optionally password-protected via
`--storage-mode password-protected` when you create it) — no external
secret store required. This is a perfectly reasonable permanent workflow,
not just a fallback, if deploys are infrequent enough that automating the
trigger isn't worth it.

### Docker (any CI provider, any self-hosted runner)

`docker/deploy.Dockerfile` bakes in dfx + Node so the deploy runs
identically anywhere Docker does:

```bash
docker build -f docker/deploy.Dockerfile -t officialiq-deploy .

# Deploy:
docker run --rm -e DFX_IDENTITY_PEM="$(cat ci-deploy.pem)" officialiq-deploy staging

# Push relay (override the entrypoint to run a different script):
docker run --rm --entrypoint bash \
  -e DFX_IDENTITY_PEM="$(cat ci-deploy.pem)" \
  -e VAPID_PRIVATE_KEY=... -e VAPID_PUBLIC_KEY=... -e VAPID_SUBJECT=mailto:you@example.com \
  officialiq-deploy -c 'bash scripts/import-identity.sh && bash scripts/write-env.sh ic && bash scripts/send-push.sh ic'
```

The image bakes in the source present at `docker build` time — rebuild it
(or bind-mount a fresh checkout over `/app`) before deploying newer code.
Point any CI system's "run a Docker image" step at this and you have a
working pipeline without writing provider-specific YAML at all.

### GitLab CI

`.gitlab-ci.yml` at the repo root mirrors the two GitHub workflows
(`deploy-staging` on push to `main`, `deploy-production` manually-gated on
a version tag) plus a `push-relay` job meant to run off a GitLab **Scheduled
Pipeline** (CI/CD → Schedules in the GitLab UI — GitLab doesn't read cron
syntax from the YAML itself the way GitHub Actions does). Set the same
`DFX_IDENTITY_PEM`/`VAPID_*` values as masked, protected CI/CD variables
instead of GitHub Secrets. This file is only useful if the repo is mirrored
to or migrated onto GitLab — its real purpose is proving (and documenting)
that the pipeline isn't GitHub-locked, not adding a second CI system to
maintain in parallel for no reason.

### Self-hosted push relay (systemd)

For running the push relay on a VPS/box you control, with no CI system —
GitHub Actions or otherwise — in the loop at all:

```bash
git clone <repo-url> /opt/officialiq && cd /opt/officialiq
npm install --prefix frontend
bash scripts/install-dfx.sh
dfx identity import ci /path/to/ci-deploy.pem --storage-mode plaintext
dfx identity use ci

sudo cp deploy/systemd/officialiq-push-relay.* /etc/systemd/system/
sudo install -m 600 deploy/systemd/officialiq-push-relay.env.example /etc/officialiq-push-relay.env
sudo $EDITOR /etc/officialiq-push-relay.env   # fill in real VAPID_* values
sudo systemctl daemon-reload
sudo systemctl enable --now officialiq-push-relay.timer
```

See `deploy/systemd/officialiq-push-relay.service` for what it actually
runs — it's the same `write-env.sh` + `send-push.sh` combination as
everywhere else, just triggered by a systemd timer instead of a GitHub
Actions schedule.

### Secrets without GitHub Secrets

Every script here reads plain environment variables
(`DFX_IDENTITY_PEM`, `VAPID_PRIVATE_KEY`, etc.) — nothing is coupled to
GitHub's secret-storage API specifically. Options that work equally well:

- A gitignored local file (e.g. `.env.deploy`) sourced before running a
  script (`source .env.deploy && bash scripts/deploy.sh ic`) — fine for a
  single operator on a trusted machine.
- A secrets manager (Vault, 1Password CLI, `sops`, AWS/GCP secret managers,
  etc.) that exports the same variable names into the shell before the
  script runs — nothing in `scripts/*.sh` needs to know or care which one.
- GitLab CI/CD variables, or whatever equivalent your CI provider calls it,
  the same way GitHub Secrets are used in `.github/workflows/`.

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
