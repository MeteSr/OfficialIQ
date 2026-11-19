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
takes the `--cycles` amount (default 2T) plus the creation fee, so
`scripts/check-cycles-balance.sh` (run by `deploy.sh` before anything
else) requires a 1T floor plus 2.5T for every canister that doesn't exist
yet: **~28.5T** for the first deploy of all 11 canisters per environment.
Later upgrades only need the floor plus whatever the post-deploy top-up
uses.

```bash
icp identity account-id --identity ci-deploy          # send ICP here, then:
icp cycles mint --cycles 50t -n ic --identity ci-deploy

# Or, with a card and no ICP:
icp cycles buy --cycles 50t -n ic --identity ci-deploy

icp cycles balance -n ic --identity ci-deploy
```

This is the actual funding step tracked in `BUSINESS.md` #7.
`scripts/deploy.sh` refuses to start a mainnet deploy the identity can't
pay for, so there's no risk of a half-finished deploy from skipping this.

### 3. Set repo secrets

| Secret | Used by | Notes |
|---|---|---|
| `ICP_IDENTITY_PEM` | `deploy-staging.yml`, `deploy-production.yml`, `cycle-watchdog.yml`, `admin-task.yml` | PEM export from step 1 (`DFX_IDENTITY_PEM` still accepted). Set it on the `staging` and `production` environments; until it's on `staging`, the staging deploy skips instead of failing |
| `CI_PUSH_TOKEN` | the deploy workflows | Optional. Fine-grained PAT (this repo, Contents: read/write) used to push `.icp/data/mappings` and the `staging-*`/`mainnet-*` tags. Only needed if `main`'s branch protection blocks the default `GITHUB_TOKEN` |
| `PUSH_RELAY_IDENTITY_PEM` | `push-relay.yml`, `admin-task.yml` | A separate key for the push relay, on the `production` environment. Create one with `openssl ecparam -name secp256k1 -genkey -noout -out push-relay.pem` (or `icp identity new push-relay` and `icp identity export push-relay`), paste the file's contents as the secret, delete the file, then run the **Admin task** workflow with `set-push-relay` (principal empty) to register it. The relay can only read push subscriptions and pending streak events; it is never the deploy key, which controls every canister. Until it's set the relay skips |
| `ANTHROPIC_API_KEY` | `admin-task.yml` (`set-ai-config`) | The spend-capped key from §7, on each environment that should have AI features. Optional variable `ANTHROPIC_MODEL` overrides the model |
| `VAPID_PRIVATE_KEY` | `push-relay.yml` | `npx --prefix frontend web-push generate-vapid-keys` |
| `VAPID_PUBLIC_KEY` | `push-relay.yml` | Same command; also build-injected as `VITE_VAPID_PUBLIC_KEY` (not secret) |
| `VAPID_SUBJECT` | `push-relay.yml` | `mailto:` address for push service abuse contact |

### 4. Configure GitHub Environments (optional but recommended)

Both deploy workflows run under `environment: staging` / `environment: production`.
Creating those environments in repo Settings → Environments lets you add
required reviewers on `production` specifically, so a mainnet deploy needs a
second person's approval click on top of being started by hand.

### 5. Claim app-level admin

Canisters with admin-only methods (`content`, `question`, `exam`, `user`,
`ranking`, `ai_proxy`) let only a **controller** set the first admin, so
nobody can claim it on a freshly deployed canister before you do. The
admin scripts (`seed-content`, `set-ai-config`, `generate-audio`,
`send-push`) run as the active icp identity (or `ICP_IDENTITY`) and claim
admin on first use — run them with the identity that deployed.

After the first deploy, load the content with the **Admin task** workflow
(`seed-content`). It is safe to re-run: articles and plays are upserted, and
questions are only added while the bank is empty.

The push relay is the exception: it runs as its own identity
(`PUSH_RELAY_IDENTITY_PEM`) and never claims admin.

### 6. Grant coordinator access

Creating an association needs the Coordinator role, which only the app
admin can grant. Run the **Admin task** workflow (Actions tab) with
`set-role`, the official's principal (shown on their Me page) and
`Coordinator`. Locally: `node frontend/scripts/admin.mjs <env> set-role
<principal> Coordinator`.

### 7. Anthropic API key

Set it with the **Admin task** workflow (`set-ai-config`) after adding the
`ANTHROPIC_API_KEY` secret to the environment; re-run it to rotate.
The key `set-ai-config` stores lives in the `ai_proxy` canister's state.
Canister memory isn't encrypted, so the subnet's node operators could read
it. Use a key from a dedicated Anthropic Console workspace with a monthly
spend limit, used for nothing else, so a leaked key can cost at most that
limit. Rotate it by re-running `set-ai-config` with the new key, then
delete the old one in the Console.

## Day-to-day usage

This follows the same pipeline shape as HomeGentic:

```
PR ──► CI (frontend tests + build, every canister type-checks and builds)
   └─► Stable Compatibility (can every canister upgrade in place from main,
                             and can existing clients still call it?)

merge to main ──► CI ──► Deploy (staging)
                          1. upgrade gate: stable-memory + Candid check against
                             the build running on staging (newest staging-* tag)
                          2. cycles pre-flight on the deploy identity
                          3. create new canisters; then per backend canister:
                             stop → snapshot → upgrade → start
                          4. frontend; 90-day freezing threshold; auto top-up
                          5. commit .icp/data/mappings (even on failure)
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

Manual deploys work the same way locally once your default icp identity
holds cycles:

```bash
bash scripts/deploy.sh staging               # full deploy
bash scripts/deploy.sh staging assets-only   # frontend-only fix, skips backend canisters
bash scripts/smoke-deployed.sh staging       # is everything up?
bash scripts/check-cycle-health.sh staging   # balance + runway per canister (make cycles-staging)
bash scripts/top-up-canisters.sh staging     # top up anything low (add --dry-run to just look)
```

## Cycles: thresholds, top-ups and monitoring

`deploy.sh` sets a **90-day freezing threshold** on every mainnet canister
(the IC default is 30): a canister stops executing once its balance would
last less than 90 more days idle, which leaves a long window to notice and
top up before anything is actually lost. The thresholds in
`scripts/lib/canisters.sh` are measured against that, using each
canister's own idle burn rate from `icp canister status`:

| Level | When | What happens |
|---|---|---|
| 🟡 top-up due | < 60 days of runway past the freezing threshold, or < 1T | `top-up-canisters.sh` adds cycles from the deploy identity up to 180 days of runway (at least 2T) |
| 🔴 alert | < 30 days of runway, or < 0.5T | `check-cycle-health.sh` fails: the deploy fails, and the watchdog run fails |

Top-ups run automatically after every deploy and every hour from
`cycle-watchdog.yml`. A failed top-up after a deploy is a warning (the
canisters are already upgraded); a failed watchdog run is the alert, and
GitHub emails it to the repo's watchers. The watchdog checks `ic` on its
schedule; run it by hand with `network: staging` for staging. It skips
itself until the environment has committed canister IDs and
`ICP_IDENTITY_PEM` is set.

When a top-up fails, the deploy identity itself is low: fund it as in
step 2 above, then run `bash scripts/top-up-canisters.sh ic`.

## How the frontend finds the canisters

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
it's the only record of which on-chain canister is which.

Both deploy workflows commit it to `main` after a deploy, **even when the
deploy failed partway**: creating a canister is real and paid for the
moment it happens, and an ID that isn't committed means the next deploy
can't see that canister and creates (and pays for) another one.
`scripts/commit-canister-ids.sh` commits on top of `main`'s current tip and
only merges in the IDs this deploy recorded, so it's safe even when `main`
moved during the deploy.

## Canister upgrades and rollback safety

`icp deploy` upgrades existing canisters in place, and every canister is a
`persistent actor` (enhanced orthogonal persistence — the only model in
moc 2), so all of its state survives an upgrade — **as long as the new
stable types are compatible with the old ones.** If they aren't (the
classic case: adding a field to a record that's stored in a `Map`, even an
optional one), the upgrade traps with "Memory-incompatible program upgrade"
and the only way forward is a reinstall that deletes the data. Three layers
catch that, plus Candid breaks that would strand existing clients:

1. **On every PR** (`stable-compat.yml` → `scripts/ci/check-stable-compat.sh`):
   compiles each canister at the PR's base and head with
   `moc --stable-types --idl`, runs `moc --stable-compatible`, and compares
   the Candid interfaces with `mops check-candid`. Run it locally with
   `bash scripts/ci/check-stable-compat.sh origin/main` (`make stable-compat`).
2. **Before every deploy** (the upgrade gate,
   `scripts/ci/upgrade-from-deployed.sh`): the same check, but from the
   commit actually running on the network (the newest `staging-*` /
   `mainnet-*` tag). Production can be many merges behind staging, and this
   is the comparison that matters.
3. **During the deploy**: icp-cli checks Candid compatibility again before
   installing, and each existing canister is stopped, snapshotted, upgraded
   and started again. A canister whose upgrade is refused is started again
   on its old code, the rest carry on, and the deploy fails without touching
   the frontend.

To keep stable state compatible, store new data in a new stable `Map`/`var`
rather than changing a stored type, or write an explicit migration (the
`migrating-motoko-actors` ICP skill). If a break is genuinely intended,
label the PR `allow-stable-break` (data will be lost: say which) or
`allow-candid-break` (every client updated in the same deploy), and deploy
with the workflow's `allow_upgrade_break` input.

The frontend can always be redeployed independently
(`scripts/deploy.sh <environment> assets-only`) without touching backend
canister state, for frontend-only fixes. Moving it to a new **major**
`@dfinity/static-site` recipe version needs `icp canister install frontend
--mode reinstall -e <env>` and then `icp deploy` (it re-uploads every
asset; no backend state is affected). A patch bump just needs
`--mode upgrade`. The sync step tells you which when the versions mismatch.

### Rolling back

Every backend canister holds one snapshot: its state from just before the
last deploy upgraded it (`deploy.sh` replaces the previous one each time
and prints the IDs at the end).

**Option A — restore the pre-upgrade snapshot (code and data).** For an
upgrade that broke a canister or corrupted its data. Anything written since
the upgrade is lost.

```bash
icp canister snapshot list user -e ic
icp canister stop user -e ic
icp canister snapshot restore user <snapshot-id> -e ic
icp canister start user -e ic
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
wrappers that install the toolchain, set an env var from a GitHub Secret,
and call those scripts; **nothing about the deploy process itself depends
on GitHub.** This section covers the alternatives, for anyone who wants to
self-host CI, avoid GitHub Actions specifically, or just deploy by hand.

| I want to... | Use |
|---|---|
| Deploy once, right now, from my own machine | The manual path below — no extra tooling |
| Run CI/deploys identically on any Docker-capable host | `docker/deploy.Dockerfile` |
| Run the push relay on a self-hosted box, no CI at all | `deploy/systemd/officialiq-push-relay.{service,timer}` |

### Manual (no CI, no Docker, no GitHub)

This is the simplest GitHub-free path and doesn't require setting up
anything beyond icp-cli itself (`npm install -g @icp-sdk/icp-cli
@icp-sdk/ic-wasm ic-mops`, or `bash scripts/install-icp.sh`):

```bash
icp identity default ci-deploy   # or whichever identity holds the cycles
bash scripts/deploy.sh staging   # or: ic
bash scripts/smoke-deployed.sh staging
bash scripts/check-cycle-health.sh staging
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
  officialiq-deploy -c 'bash scripts/import-identity.sh && npm ci --prefix frontend && bash scripts/send-push.sh ic'
```

The image bakes in the source present at `docker build` time — rebuild it
(or bind-mount a fresh checkout over `/app`) before deploying newer code.
Point any CI system's "run a Docker image" step at this and you have a
working pipeline without writing provider-specific YAML at all.

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

## Keeping the ICP stack current

Three things keep the stack from drifting behind DFINITY's guidance:

- **Dependabot** (`.github/dependabot.yml`) opens weekly PRs for the
  frontend's npm packages — the `@icp-sdk/*` packages always together, since
  `@icp-sdk/auth` peers one `@icp-sdk/core` major — for the pinned CI
  toolchain in `tools/package.json` (icp-cli, ic-wasm, mops), and monthly for
  GitHub Actions.
- **ICP freshness** (`.github/workflows/icp-freshness.yml`, Mondays) runs
  `scripts/check-icp-freshness.sh`, which covers what Dependabot can't: the
  moc compiler pin, mops packages, icp-cli recipe versions in `icp.yaml`, and
  DFINITY's published ICP skills. Updates land in one "ICP stack updates
  available" issue. When a skill changes, it also opens a PR updating
  `.github/icp-skills.json` that lists the changed skills; merge it once the
  app has been checked against them. The first run records a baseline.
  This needs "Allow GitHub Actions to create and approve pull requests"
  enabled under Settings → Actions → General.
- **Backend CI** and **Frontend CI** build and test every one of those PRs,
  so a bump that breaks the build fails before it merges.

## Verifying icp-cli details

icp-cli is moving fast. `tools/package.json` pins the versions CI uses
(Dependabot proposes upgrades), and the weekly **ICP freshness** workflow
flags newer recipe, compiler and Motoko package releases. When in doubt,
`icp <command> --help` is authoritative — icp-cli's flags are not dfx's.

The deploy scripts were rehearsed end to end with icp-cli 1.8.0 against a
local network configured as a separate environment (so the mainnet code
paths ran): a first deploy of all 11 canisters, two upgrades with data
kept, a refused stable-incompatible upgrade, a snapshot restore, top-ups,
and the pre-flight, health and smoke checks.
