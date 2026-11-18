# Deployment

This covers deploying OfficialIQ beyond the local network: staging (a
second canister set on IC mainnet) and production (the `ic` environment,
real IC mainnet). See issue #33 for the full pipeline design and
`BUSINESS.md` #7 for the business-side asks this depends on (cycles
funding, push-relay hosting decision).

Everything here uses [icp-cli](https://cli.internetcomputer.org) (`icp`),
which replaced the legacy `dfx`. Config lives in `icp.yaml` (canisters,
environments) and `mops.toml` (Motoko compiler, dependencies, canister entry
points). The toolchain versions CI uses are pinned in `tools/package.json`
and installed by `scripts/install-icp.sh`.

**Nothing here works until the funding/account steps in `BUSINESS.md` #7
are done.** Everything in this doc and the CI workflows is built and ready
to go the moment that funding exists — that's the point of doing it now
rather than later.

## Why "staging" instead of a real testnet

The Internet Computer doesn't have an official public testnet the way many
other chains do. The practical equivalent used here is a **second,
separately-funded canister set deployed to IC mainnet** — same network,
isolated canister IDs and data. `icp.yaml` declares it as a `staging`
environment on the `ic` network; the `ic` (production) and `local`
environments are built in.

## One-time setup

### 1. Create a dedicated deploy identity

Don't reuse a developer's personal identity for CI. Create one specifically
for automated deploys and export its key:

```bash
icp identity new ci-deploy
icp identity export ci-deploy > ci-deploy.pem   # keep this out of git
icp identity principal --identity ci-deploy     # note the principal
```

`ci-deploy.pem`'s contents become the `ICP_IDENTITY_PEM` repo secret
(Settings → Secrets and variables → Actions). Never commit this file —
delete the local copy once it's in GitHub Secrets. An existing
`DFX_IDENTITY_PEM` secret keeps working (the workflows fall back to it), and
a PEM exported from dfx imports unchanged, with the same principal.

### 2. Fund the identity with cycles

icp-cli has no cycles wallet canister: deploys spend cycles straight from
the deploying identity's **cycles-ledger balance** on mainnet, and staging
and production share it (both are on the `ic` network). Each new canister
takes the `--cycles` amount (default 2T) plus a 100M ledger fee, so a first
deploy of all 11 canisters needs roughly 23T cycles per environment, plus a
margin for top-ups.

```bash
icp identity account-id --identity ci-deploy          # send ICP here, then:
icp cycles mint --cycles 50t -n ic --identity ci-deploy

# Or, with a card and no ICP:
icp cycles buy --cycles 50t -n ic --identity ci-deploy

icp cycles balance -n ic --identity ci-deploy
```

This is the actual funding step tracked in `BUSINESS.md` #7.
`scripts/deploy.sh` refuses to start a mainnet deploy when the identity
holds under 1T cycles, so there's no risk of a half-finished deploy from
skipping this.

### 3. Set repo secrets

| Secret | Used by | Notes |
|---|---|---|
| `ICP_IDENTITY_PEM` | `deploy-staging.yml`, `deploy-production.yml`, `push-relay.yml` | PEM export from step 1 (`DFX_IDENTITY_PEM` still accepted) |
| `VAPID_PRIVATE_KEY` | `push-relay.yml` | `npx --prefix frontend web-push generate-vapid-keys` |
| `VAPID_PUBLIC_KEY` | `push-relay.yml` | Same command; also build-injected as `VITE_VAPID_PUBLIC_KEY` (not secret) |
| `VAPID_SUBJECT` | `push-relay.yml` | `mailto:` address for push service abuse contact |

### 4. Configure GitHub Environments (optional but recommended)

Both deploy workflows run under `environment: staging` / `environment: production`.
Creating those environments in repo Settings → Environments lets you add
required reviewers on `production` specifically, so a mainnet deploy needs a
human approval click even though the tag-push trigger is automatic.

### 5. Claim app-level admin

Canisters with admin-only methods (`content`, `question`, `exam`, `user`,
`ranking`, `ai_proxy`) let only a **controller** set the first admin, so
nobody can claim it on a freshly deployed canister before you do. The
admin scripts (`seed-content`, `set-ai-config`, `generate-audio`,
`send-push`) run as the active icp identity (or `ICP_IDENTITY`) and claim
admin on first use — run them with the identity that deployed.

## Day-to-day usage

- **Staging** deploys automatically on every push to `main` that touches
  backend/frontend/build-config paths (`deploy-staging.yml`).
- **Production** deploys only on a version tag push (`v*.*.*`) or manual
  dispatch (`deploy-production.yml`) — never automatically from `main`.
- **Push relay** runs every 15 minutes against `ic` once secrets exist
  (`push-relay.yml`). Swap this for a different always-on host if that's
  what gets decided for `BUSINESS.md` #7 — the workflow is just one valid
  answer, not the only one.

Manual deploys work the same way locally once your default icp identity
holds cycles:

```bash
bash scripts/deploy.sh staging              # full deploy
bash scripts/deploy.sh staging assets-only  # frontend-only fix, skips backend canisters
bash scripts/check-cycles.sh staging        # remaining balance per canister
```

### How the frontend finds the canisters

`icp deploy` injects every canister's ID into every canister as
`PUBLIC_CANISTER_ID:<name>`. The frontend canister (`@dfinity/static-site`,
the certified-assets canister) hands those IDs and the network's root key
to the browser in an `ic_env` cookie, which `frontend/src/lib/icEnv.ts`
reads — so one build works on local, staging and production with no `.env`
file. `vite dev` sets the same cookie from the local network (see
`frontend/vite.config.ts`).

The frontend is built in the recipe's `presync` step, after the canisters
exist, so the IDs are also baked into the bundle as a fallback for clients
that never get the cookie — the Capacitor Android app. To build the Android
bundle on its own, point it at an environment's committed ID mapping:

```bash
cd frontend && ICP_ENVIRONMENT=ic npx vite build && npx cap sync android
```

Routing and response headers for the frontend canister live in
`frontend/public/_redirects` (SPA fallback) and `frontend/public/_headers`
(caching, security headers). The legacy `.ic-assets.json5` is not read by
this canister.

## Canister ID mappings

Local canister IDs live under `.icp/cache/` (gitignored, regenerated per
developer). Mainnet IDs (`staging`, `ic`) are written to
`.icp/data/mappings/<environment>.ids.json`, which **must be committed** —
it's the only record of which on-chain canister is which. The CI workflows
commit it automatically after a staging deploy; production deploys only
warn if it changed, since auto-pushing to `main` from a tag build is
riskier than it's worth for a file that should only change once per new
canister (see the workflow's comments).

## Canister upgrades and rollback safety

`icp deploy` upgrades existing canisters in place. All canister state
survives upgrades because every canister is a `persistent actor` (enhanced
orthogonal persistence — the only model in moc 2; see `CLAUDE.md`). Before
deploying a change that **removes or changes the type of** a persistent
field:

1. icp-cli checks Candid interface compatibility before installing and
   stops on a breaking change. Don't bypass it with `--yes` unless you have
   confirmed the break is intended.
2. If a state migration is genuinely needed, write it as an explicit
   migration (see the `migrating-motoko-actors` ICP skill) — moc refuses an
   upgrade that would silently drop data, but it's still worth rehearsing on
   staging before production.
3. The frontend can always be redeployed independently
   (`scripts/deploy.sh <environment> assets-only`) without touching backend
   canister state, for frontend-only fixes.
4. Moving the frontend canister to a new **major** `@dfinity/static-site`
   recipe version needs `icp canister install frontend --mode reinstall -e
   <env>` and then `icp deploy` (it re-uploads every asset; no backend state
   is affected). A patch bump just needs `--mode upgrade`. The sync step
   tells you which when the versions mismatch.

## Deploying without GitHub

Every piece of actual deploy logic lives in `scripts/*.sh` — plain bash,
called with plain environment variables. `.github/workflows/*.yml` are thin
wrappers that install the toolchain, set an env var from a GitHub Secret,
and call those scripts; **nothing about the deploy process itself depends
on GitHub.** This section covers the alternatives, for anyone who wants to
self-host CI, avoid GitHub Actions specifically, or just deploy by hand.

| I want to... | Use |
|---|---|
| Deploy once, right now, from my own machine | The manual path below — no extra tooling |
| Run CI on GitLab instead of GitHub | `.gitlab-ci.yml` (repo root) |
| Run CI/deploys identically on any Docker-capable host | `docker/deploy.Dockerfile` |
| Run the push relay on a self-hosted box, no CI at all | `deploy/systemd/officialiq-push-relay.{service,timer}` |

### Manual (no CI, no Docker, no GitHub)

This is the simplest GitHub-free path and doesn't require setting up
anything beyond icp-cli itself (`npm install -g @icp-sdk/icp-cli
@icp-sdk/ic-wasm ic-mops`, or `bash scripts/install-icp.sh`):

```bash
icp identity default ci-deploy   # or whichever identity holds the cycles
bash scripts/deploy.sh staging   # or: ic
bash scripts/check-cycles.sh staging
```

The identity's private key stays in your OS keyring (icp-cli's default
storage), or password-protected with `--storage password` when you create
it — no external secret store required. This is a perfectly reasonable
permanent workflow, not just a fallback, if deploys are infrequent enough
that automating the trigger isn't worth it.

### Docker (any CI provider, any self-hosted runner)

`docker/deploy.Dockerfile` bakes in icp-cli, mops + Node so the deploy runs
identically anywhere Docker does:

```bash
docker build -f docker/deploy.Dockerfile -t officialiq-deploy .

# Deploy:
docker run --rm -e ICP_IDENTITY_PEM="$(cat ci-deploy.pem)" officialiq-deploy staging

# Push relay (override the entrypoint to run a different script):
docker run --rm --entrypoint bash \
  -e ICP_IDENTITY_PEM="$(cat ci-deploy.pem)" \
  -e VAPID_PRIVATE_KEY=... -e VAPID_PUBLIC_KEY=... -e VAPID_SUBJECT=mailto:you@example.com \
  officialiq-deploy -c 'bash scripts/import-identity.sh && npm install --prefix frontend && bash scripts/send-push.sh ic'
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
`ICP_IDENTITY_PEM`/`VAPID_*` values as masked, protected CI/CD variables
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
bash scripts/install-icp.sh
export PATH="/opt/officialiq/tools/node_modules/.bin:$PATH"
icp identity import ci --from-pem /path/to/ci-deploy.pem --storage plaintext
icp identity default ci

sudo cp deploy/systemd/officialiq-push-relay.* /etc/systemd/system/
sudo install -m 600 deploy/systemd/officialiq-push-relay.env.example /etc/officialiq-push-relay.env
sudo $EDITOR /etc/officialiq-push-relay.env   # fill in real VAPID_* values
sudo systemctl daemon-reload
sudo systemctl enable --now officialiq-push-relay.timer
```

See `deploy/systemd/officialiq-push-relay.service` for what it actually
runs — the same `send-push.sh` as everywhere else, just triggered by a
systemd timer instead of a GitHub Actions schedule. It reads canister IDs
from the committed `.icp/data/mappings/ic.ids.json`.

### Secrets without GitHub Secrets

Every script here reads plain environment variables
(`ICP_IDENTITY_PEM`, `VAPID_PRIVATE_KEY`, etc.) — nothing is coupled to
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

1. Add a `frontend/public/.well-known/ic-domains` file listing the domain.
   The certified-assets canister uploads `.well-known/` automatically.
2. Follow the `custom-domains` ICP skill for the DNS records and boundary
   node registration.
3. Before users sign in on the new domain, set Internet Identity's
   `derivationOrigin` to the canister origin and publish
   `.well-known/ii-alternative-origins` (see the `user-sign-in` skill) —
   otherwise every user gets a different principal on the domain.

## Verifying icp-cli details

icp-cli is moving fast. `tools/package.json` pins the versions CI uses
(Dependabot proposes upgrades), and the weekly **ICP freshness** workflow
flags newer recipe, compiler and Motoko package releases. When in doubt,
`icp <command> --help` is authoritative — icp-cli's flags are not dfx's.
