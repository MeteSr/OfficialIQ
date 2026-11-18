#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/deploy.sh [network] [mode]
#   network  local (default) | staging | ic
#   mode     full (default) | assets-only (skips the backend canisters, for
#            frontend-only fixes)
#
# On staging/ic every backend canister that already exists is stopped,
# snapshotted, upgraded and started again; the snapshot is the rollback for
# an upgrade that installs but misbehaves (docs/DEPLOYMENT.md → "Rolling
# back"). SKIP_SNAPSHOTS=1 skips that, e.g. for a deploy that only adds a
# canister.

NETWORK="${1:-local}"
MODE="${2:-full}"
ENV_FILE=".env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/canisters.sh"   # BACKEND_CANISTERS, FREEZE_DAYS, helpers

echo "==> Deploying OfficialIQ to network: $NETWORK ($MODE)"

if [[ "$NETWORK" == "local" ]]; then
  # Start local replica if needed. dfx can leave stale state behind after a
  # hard restart (e.g. the host or a WSL VM stopping without a clean
  # `dfx stop` first):
  #  - a stale lock/PID makes `dfx start` fail with "dfx is already
  #    running" even though nothing is actually listening. `dfx stop` is a
  #    safe no-op when nothing's running, so run it first.
  #  - leftover PocketIC port-file dirs under /tmp (from long-past crashed
  #    or killed sessions, not just the most recent one) can accumulate and
  #    make every new `dfx start` fail with "Failed to initialize PocketIC:
  #    HTTP status client error (400 Bad Request)" on a freshly-spawned
  #    instance, even though nothing about the current attempt is wrong.
  #    Scoped to only directories that actually hold PocketIC's own marker
  #    file, so this can't touch unrelated tools' temp dirs.
  if ! dfx ping local 2>/dev/null; then
    dfx stop 2>/dev/null || true
    for d in /tmp/.tmp*/; do
      [ -e "${d}pocketic-tmp-port" ] && rm -rf "$d"
    done
    dfx start --background --clean
  fi
else
  # Real network (staging/ic): refuse to start on a missing wallet or one
  # without enough cycles for this deploy, rather than fail halfway through a
  # multi-canister deploy. See docs/DEPLOYMENT.md for wallet setup/funding.
  export DFX_WARNING="-mainnet_plaintext_identity"
  bash "$SCRIPT_DIR/check-wallet-balance.sh" "$NETWORK"
fi

# upgrade_with_snapshot <canister> — stop, snapshot, upgrade, start. Replaces
# the previous deploy's snapshot so each canister holds one rolling snapshot.
# A canister whose snapshot fails isn't upgraded; one whose upgrade fails is
# started again on its old code. Either way the deploy carries on with the
# rest and fails at the end.
SNAPSHOTS=()
FAILED_CANISTERS=()
upgrade_with_snapshot() {
  local c="$1" old snap out
  old=$(dfx canister snapshot list "$c" --network "$NETWORK" 2>&1 | grep -oE '^[0-9a-f]{20,}' | head -1 || true)
  if ! dfx canister stop "$c" --network "$NETWORK"; then
    FAILED_CANISTERS+=("$c (could not stop)"); return
  fi
  if ! out=$(dfx canister snapshot create "$c" ${old:+--replace "$old"} --network "$NETWORK" 2>&1); then
    echo "$out" >&2
    dfx canister start "$c" --network "$NETWORK" || true
    FAILED_CANISTERS+=("$c (no snapshot, not upgraded)"); return
  fi
  snap=$(printf '%s\n' "$out" | grep -oE 'Snapshot ID: [0-9a-f]+' | awk '{print $3}')
  SNAPSHOTS+=("$c ${snap:-?}")
  if ! dfx deploy "$c" --network "$NETWORK" --yes; then
    FAILED_CANISTERS+=("$c (upgrade failed, still on the old code)")
  fi
  dfx canister start "$c" --network "$NETWORK" || FAILED_CANISTERS+=("$c (did not start)")
}

if [[ "$MODE" != "assets-only" ]]; then
  # Deploy backend canisters first (assets needs frontend/dist, which needs
  # these canister IDs, so it must come after the .env write + frontend build)
  for c in "${BACKEND_CANISTERS[@]}"; do
    echo "--> Deploying $c..."
    if [[ "$NETWORK" != "local" && "${SKIP_SNAPSHOTS:-}" != "1" && -n "$(canister_id "$c" "$NETWORK")" ]]; then
      upgrade_with_snapshot "$c"
    else
      dfx deploy "$c" --network "$NETWORK" --yes || FAILED_CANISTERS+=("$c (deploy failed)")
    fi
  done
  if [[ ${#FAILED_CANISTERS[@]} -gt 0 ]]; then
    echo "!! Backend deploy failed — not deploying the frontend:" >&2
    printf '   %s\n' "${FAILED_CANISTERS[@]}" >&2
    [[ ${#SNAPSHOTS[@]} -gt 0 ]] && { echo "   Pre-upgrade snapshots (canister id):" >&2; printf '     %s\n' "${SNAPSHOTS[@]}" >&2; }
    exit 1
  fi
fi

# Write canister IDs to .env for Vite
echo "==> Writing canister IDs to $ENV_FILE"
bash "$SCRIPT_DIR/write-env.sh" "$NETWORK"

# Build the frontend with canister IDs baked in, then deploy assets
echo "==> Building frontend..."
# npm install has been observed leaving node_modules/.bin/* non-executable
# on at least one fresh WSL install — when that happens, a bare `tsc`
# silently falls through to whatever else is on PATH (e.g. an unrelated
# global install) instead of failing loudly. Cheap enough to just always
# fix up permissions rather than debug it again if it recurs.
#
# Bundles with `vite build` rather than `npm run build`, same as CI: the `tsc`
# step in `npm run build` still fails on unused-variable errors in a few
# pages, and a type-check failure shouldn't block a deploy that CI has
# already passed. Switch back once those are cleaned up (see ci.yml).
(cd frontend && npm install && { chmod +x node_modules/.bin/* 2>/dev/null || true; } && npx vite build)

echo "--> Deploying assets..."
dfx deploy assets --network "$NETWORK" --yes

if [[ "$NETWORK" != "local" ]]; then
  # Every real-network canister freezes ${FREEZE_DAYS} days before it would run
  # dry (the IC default is 30), which is what the cycle thresholds in
  # scripts/lib/canisters.sh are measured against. Idempotent.
  echo "==> Setting a ${FREEZE_DAYS}-day freezing threshold..."
  for c in "${ALL_CANISTERS[@]}"; do
    dfx canister update-settings "$c" --freezing-threshold $(( FREEZE_DAYS * 86400 )) --network "$NETWORK" --yes >/dev/null \
      || echo "   (could not set the freezing threshold on $c)"
  done

  # A failed top-up is a warning, not a failed deploy: the canisters are
  # already upgraded. The workflow's cycle health gate and the hourly
  # watchdog fail loudly if a canister is actually close to freezing.
  echo "==> Topping up canisters that are low on cycles..."
  bash "$SCRIPT_DIR/top-up-canisters.sh" "$NETWORK" \
    || gh_warning "Cycle top-up failed" "Deployed, but some canisters could not be topped up. Fund the wallet and run: bash scripts/top-up-canisters.sh $NETWORK"

  if [[ ${#SNAPSHOTS[@]} -gt 0 ]]; then
    echo "==> Pre-upgrade snapshots (canister id) — rollback: docs/DEPLOYMENT.md → \"Rolling back\""
    printf '     %s\n' "${SNAPSHOTS[@]}"
  fi
fi

echo "==> Done. Canister IDs:"
cat "$ENV_FILE"
