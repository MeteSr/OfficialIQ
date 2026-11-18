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

Repeat for `--network ic` once staging is validated. Note each wallet's ID
(`dfx identity get-wallet --network staging`): CI runners keep no dfx state
between runs, so it goes into the `DFX_WALLET_ID` secret below.

How much to fund: `scripts/check-wallet-balance.sh` (run by `deploy.sh`
before anything else) requires a 1T floor plus 3.5T for every canister that
doesn't exist yet, which is what dfx moves into each new canister. The first
deploy of all 11 canisters needs **~39.5T** per network; later upgrades only
need the 1T floor plus whatever the post-deploy top-up uses. This is the actual
funding step tracked in `BUSINESS.md` #7 — someone needs to acquire ICP and
convert it to cycles. `scripts/deploy.sh` refuses to run against a
non-local network without a configured, funded wallet, so there's no risk
of a half-finished deploy from skipping this.

### 3. Set repo secrets

Set these as **environment** secrets (Settings → Environments → `staging` /
`production`), so staging and production each get their own identity and
wallet:

| Secret | Used by | Notes |
|---|---|---|
| `DFX_IDENTITY_PEM` | `deploy-staging.yml`, `deploy-production.yml`, `cycle-watchdog.yml`, `push-relay.yml` | PEM export from step 1. Until it's set on `staging`, the staging deploy skips instead of failing |
| `DFX_WALLET_ID` | the same | That environment's cycles wallet from step 2 (a variable works too, it isn't secret) |
| `CI_PUSH_TOKEN` | the deploy workflows | Optional. Fine-grained PAT (this repo, Contents: read/write) used to push `canister_ids.json` and the `staging-*`/`mainnet-*` tags. Only needed if `main`'s branch protection blocks the default `GITHUB_TOKEN` |
| `VAPID_PRIVATE_KEY` | `push-relay.yml` | `npx --prefix frontend web-push generate-vapid-keys` |
| `VAPID_PUBLIC_KEY` | `push-relay.yml` | Same command; also build-injected as `VITE_VAPID_PUBLIC_KEY` (not secret) |
| `VAPID_SUBJECT` | `push-relay.yml` | `mailto:` address for push service abuse contact |

### 4. Configure GitHub Environments (optional but recommended)

Both deploy workflows run under `environment: staging` / `environment: production`.
Creating those environments in repo Settings → Environments lets you add
required reviewers on `production` specifically, so a mainnet deploy needs a
second person's approval click on top of being started by hand.

## Day-to-day usage

This follows the same pipeline shape as HomeGentic:

```
PR ──► CI (frontend tests + build, every canister compiles)
   └─► Stable Compatibility (can every canister upgrade in place from main?)

merge to main ──► CI ──► Deploy (staging)
                          1. upgrade gate: stable-memory check against the
                             build running on staging (newest staging-* tag)
                          2. wallet pre-flight
                          3. deploy: snapshot → upgrade → start, per canister
                          4. 90-day freezing threshold, auto top-up
                          5. commit canister_ids.json (even on failure)
                          6. smoke test, cycle health gate
                          7. tag staging-YYYYMMDD-HHMMSS

Actions → Deploy (production) → Run workflow on main
                          same steps against ic, after a full CI run,
                          tagged mainnet-YYYYMMDD-HHMMSS + a GitHub release

hourly ──► Cycle Watchdog (ic): app answers, balances, top-up
every 15 min ──► Push relay
```

- **Staging** deploys every commit on `main` once CI has passed on it
  (`deploy-staging.yml`). It deploys the exact commit CI tested, not
  whatever `main` points at by the time the deploy starts.
- **Production** deploys only when someone runs `deploy-production.yml`
  from the Actions tab on `main`. It re-runs CI first, so it can't ship a
  commit whose tests fail. Every successful run tags the commit
  `mainnet-YYYYMMDD-HHMMSS` and publishes a GitHub release with the merged
  PRs since the previous one and each canister's module hash
  (`scripts/ops/release-manifest.sh`).
- **A deploy fails** (not just warns) if any canister isn't running or its
  `metrics()` query doesn't answer afterwards (`scripts/smoke-deployed.sh`),
  or if any canister is within 30 days of its freezing threshold or its
  balance can't be read (`scripts/check-cycle-health.sh`). Neither failure
  tags the commit, so a bad deploy never becomes the baseline for the next
  upgrade check or a rollback target.
- **Push relay** runs every 15 minutes against `ic` once secrets exist
  (`push-relay.yml`). Swap this for a different always-on host if that's
  what gets decided for `BUSINESS.md` #7 — the workflow is just one valid
  answer, not the only one.

Manual deploys work the same way locally once your dfx identity has the
`ci-deploy` wallet's cycles (or your own):

```bash
bash scripts/deploy.sh staging               # full deploy
bash scripts/deploy.sh staging assets-only   # frontend-only fix, skips backend canisters
bash scripts/smoke-deployed.sh staging       # is everything up?
bash scripts/check-cycle-health.sh staging   # balance + runway per canister (make cycles-staging)
bash scripts/top-up-canisters.sh staging     # top up anything low (add --dry-run to just look)
```

## Cycles: thresholds, top-ups and monitoring

`deploy.sh` sets a **90-day freezing threshold** on every real-network
canister (the IC default is 30): a canister stops executing once its
balance would last less than 90 more days idle, which leaves a long window
to notice and top up before anything is actually lost. The thresholds in
`scripts/lib/canisters.sh` are measured against that, using each
canister's own idle burn rate from `dfx canister status`:

| Level | When | What happens |
|---|---|---|
| 🟡 top-up due | < 60 days of runway past the freezing threshold, or < 1T | `top-up-canisters.sh` adds cycles from the wallet up to 180 days of runway (at least 2T) |
| 🔴 alert | < 30 days of runway, or < 0.5T | `check-cycle-health.sh` fails: the deploy fails, and the watchdog run fails |

Top-ups run automatically after every deploy and every hour from
`cycle-watchdog.yml`. A failed top-up after a deploy is a warning (the
canisters are already upgraded); a failed watchdog run is the alert, and
GitHub emails it to the repo's watchers. The watchdog checks `ic` on its
schedule; run it by hand with `network: staging` for staging. It skips
itself until the network has canister IDs and `DFX_IDENTITY_PEM` is set.

### Topping up the wallet

When a top-up fails, the wallet itself is low:

```bash
dfx identity use ci-deploy
dfx wallet balance --network ic
dfx ledger top-up "$(dfx identity get-wallet --network ic)" --amount <ICP> --network ic
bash scripts/top-up-canisters.sh ic
```

The ICP for this comes from the account funded in `BUSINESS.md` #7.

## canister_ids.json

Local/ephemeral canister IDs live under `.dfx/` (gitignored, regenerated
per developer). Real-network IDs (`staging`, `ic`) are written to
`canister_ids.json` at the repo root, which is **meant to be committed** —
those IDs are permanent for the life of the canister.

Both deploy workflows commit it to `main` after a deploy, **even when the
deploy failed partway**: creating a canister is real and paid for the
moment it happens, and an ID that isn't committed means the next deploy
can't see that canister and creates (and pays for) another one.
`scripts/commit-canister-ids.sh` commits on top of `main`'s current tip and
only merges in the IDs this deploy recorded, so it's safe even when `main`
moved during the deploy.

## Canister upgrades and rollback safety

`dfx deploy` upgrades canisters in place, and every canister is a
`persistent actor`, so all of its state survives an upgrade — **as long as
the new stable types are compatible with the old ones.** If they aren't
(the classic case: adding a field to a record that's stored in a `Map`, even
an optional one), the upgrade traps with "Memory-incompatible program
upgrade" and the only way forward is a reinstall that deletes the data.
Three layers catch that:

1. **On every PR** (`stable-compat.yml` → `scripts/ci/check-stable-compat.sh`):
   compiles each canister at the PR's base and head with
   `moc --stable-types` and runs `moc --stable-compatible`. Run it locally
   with `bash scripts/ci/check-stable-compat.sh origin/main`.
2. **Before every deploy** (the upgrade gate,
   `scripts/ci/upgrade-from-deployed.sh`): the same check, but from the
   commit actually running on the network (the newest `staging-*` /
   `mainnet-*` tag). Production can be many merges behind staging, and this
   is the comparison that matters.
3. **During the deploy**: each existing canister is stopped, snapshotted,
   upgraded and started again. A canister whose upgrade is refused is
   started again on its old code, the rest carry on, and the deploy fails
   without touching the frontend.

To keep stable state compatible, store new data in a new stable `Map`/`var`
rather than changing a stored type, or convert existing data with a
migration function (`(with migration = ...) persistent actor { ... }`).
If a reinstall is genuinely intended, label the PR `allow-stable-break` and
say which data will be lost, then deploy with the workflow's
`allow_upgrade_break` input.

Assets can always be redeployed independently
(`scripts/deploy.sh <network> assets-only`) without touching backend
canister state, for frontend-only fixes.

### Rolling back

Every backend canister holds one snapshot: its state from just before the
last deploy upgraded it (`deploy.sh` replaces the previous one each time
and prints the IDs at the end).

**Option A — restore the pre-upgrade snapshot (code and data).** For an
upgrade that broke a canister or corrupted its data. Anything written since
the upgrade is lost.

```bash
dfx canister snapshot list user --network ic
dfx canister stop user --network ic
dfx canister snapshot load user <snapshot-id> --network ic
dfx canister start user --network ic
```

**Option B — redeploy the previous code (keeps current data).** Every
successful production deploy is tagged (`git tag -l 'mainnet-*'`):

```bash
git checkout <last good mainnet-* tag>
bash scripts/ci/check-stable-compat.sh main      # can the old code read today's data?
SKIP_SNAPSHOTS=1 bash scripts/deploy.sh ic       # keeps Option A's snapshot intact
```

Rolling back is itself an upgrade: it only works if the old types can
accept the data as the new version left it. If the new version only added
stable vars, it usually can. If it can't, use Option A or fix forward.

**A deploy that failed part-way.** `deploy.sh` keeps going after one
canister's upgrade fails and exits non-zero, so the others are on the new
code and the failed one on the old. Fix it and re-run (already-upgraded
canisters just upgrade to the same code), or restore the ones that did
upgrade with Option A if the mix of versions breaks the app meanwhile.

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
bash scripts/smoke-deployed.sh staging
bash scripts/check-cycle-health.sh staging
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
a version tag; the GitHub workflows have since moved production to a manual
run on `main` and added the upgrade gate, smoke test and cycle checks, which
the GitLab file doesn't mirror yet) plus a `push-relay` job meant to run off a GitLab **Scheduled
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

The scripts were run end to end against dfx 0.31.0: a first deploy, two
upgrades (data kept), a refused upgrade, a snapshot restore, a top-up and
the health/smoke checks, on a local replica configured as a persistent
network so the real-network code paths ran. Two version notes:

- The backend needs a dfx recent enough to bundle a `core` library with
  `Array.sortInPlace`/`sliceToArray` (0.29.x is too old; 0.31.0 works).
  `scripts/install-dfx.sh` installs the latest release.
- `dfx canister snapshot` output goes to stderr and its format has changed
  across releases; `deploy.sh` parses the `Snapshot ID:` line. If a dfx
  upgrade breaks that, deploys fail with "no snapshot, not upgraded"
  rather than upgrading without one.
