#!/usr/bin/env bash
set -euo pipefail

# Deploys every canister in icp.yaml to an environment: local, staging, or
# ic (production).
#
# Usage: scripts/deploy.sh [environment] [mode]
#   environment  local (default) | staging | ic
#   mode         full (default) | assets-only (frontend only, for frontend fixes)
#
# Locally this is one `icp deploy`. On mainnet (staging/ic) it goes canister
# by canister so each backend upgrade is reversible:
#   1. pre-flight: the deploying identity holds enough cycles for this deploy
#      (scripts/check-cycles-balance.sh);
#   2. create any canister that doesn't exist yet, so every canister's ID is
#      known before any of them is installed (`icp deploy` injects every ID
#      into every canister as PUBLIC_CANISTER_ID:<name>);
#   3. each existing backend canister is stopped, snapshotted, upgraded and
#      started again; the snapshot is the rollback for an upgrade that
#      installs but misbehaves (docs/DEPLOYMENT.md → "Rolling back"). A
#      canister whose upgrade is refused is started again on its old code,
#      the rest carry on, and the deploy fails without touching the frontend;
#   4. the frontend is deployed (its presync step builds it against the IDs);
#   5. a 90-day freezing threshold, and a top-up of any canister running low.
# SKIP_SNAPSHOTS=1 skips step 3's snapshots (and the downtime of stopping).

ENVIRONMENT="${1:-local}"
MODE="${2:-full}"

cd "$(dirname "$0")/.."
SCRIPT_DIR="$PWD/scripts"
source "$SCRIPT_DIR/lib/canisters.sh"   # BACKEND_CANISTERS, ALL_CANISTERS, FREEZE_DAYS, helpers
echo "==> Deploying OfficialIQ to environment: $ENVIRONMENT ($MODE)"

# Reproducible Motoko dependencies: with a committed mops.lock, fail rather
# than silently re-resolve.
if [[ -f mops.lock ]]; then mops install --locked; else mops install; fi

if [[ "$ENVIRONMENT" == "local" ]]; then
  # The local network is per project; starting one that's already running
  # is a no-op error we can ignore.
  icp network start -d 2>/dev/null || true
  if [[ "$MODE" == "assets-only" ]]; then icp deploy frontend -e local; else icp deploy -e local; fi
  echo "==> Done. Canister IDs:"
  icp canister status -e local --id-only
  exit 0
fi

# ── Mainnet (staging / ic) ────────────────────────────────────────────────────
bash "$SCRIPT_DIR/check-cycles-balance.sh" "$ENVIRONMENT"

if [[ "$MODE" == "assets-only" ]]; then
  icp deploy frontend -e "$ENVIRONMENT"
  echo "==> Done."
  exit 0
fi

EXISTING=()
for c in "${ALL_CANISTERS[@]}"; do
  if [[ -n "$(canister_id "$c" "$ENVIRONMENT")" ]]; then
    EXISTING+=("$c")
  else
    echo "--> Creating $c..."
    icp canister create "$c" -e "$ENVIRONMENT"
  fi
done
existed() { printf '%s\n' "${EXISTING[@]:-}" | grep -qx "$1"; }

SNAPSHOTS=()
FAILED=()
upgrade_with_snapshot() {
  local c="$1" old snap
  old=$(icp canister snapshot list "$c" -e "$ENVIRONMENT" -q 2>/dev/null | grep -oE '^[0-9a-f]{20,}' | head -1 || true)
  if ! icp canister stop "$c" -e "$ENVIRONMENT"; then
    FAILED+=("$c (could not stop)"); return
  fi
  snap=$(icp canister snapshot create "$c" ${old:+--replace "$old"} -e "$ENVIRONMENT" -q 2>&1 | grep -oE '^[0-9a-f]{20,}' | tail -1 || true)
  if [[ -z "$snap" ]]; then
    icp canister start "$c" -e "$ENVIRONMENT" || true
    FAILED+=("$c (no pre-upgrade snapshot, not upgraded)"); return
  fi
  SNAPSHOTS+=("$c $snap")
  icp deploy "$c" -e "$ENVIRONMENT" || FAILED+=("$c (upgrade failed, still on the old code)")
  icp canister start "$c" -e "$ENVIRONMENT" || FAILED+=("$c (did not start)")
}

for c in "${BACKEND_CANISTERS[@]}"; do
  echo "--> Deploying $c..."
  if existed "$c" && [[ "${SKIP_SNAPSHOTS:-}" != "1" ]]; then
    upgrade_with_snapshot "$c"
  else
    icp deploy "$c" -e "$ENVIRONMENT" || FAILED+=("$c (deploy failed)")
  fi
done

print_snapshots() {
  [[ ${#SNAPSHOTS[@]} -gt 0 ]] || return 0
  echo "   Pre-upgrade snapshots (canister id) — rollback: docs/DEPLOYMENT.md → \"Rolling back\""
  printf '     %s\n' "${SNAPSHOTS[@]}"
}

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "!! Backend deploy failed — not deploying the frontend:" >&2
  printf '   %s\n' "${FAILED[@]}" >&2
  print_snapshots >&2
  exit 1
fi

echo "--> Deploying frontend..."
icp deploy frontend -e "$ENVIRONMENT"

# Every mainnet canister freezes FREEZE_DAYS days before it would run dry
# (the IC default is 30), which is what the cycle thresholds in
# scripts/lib/canisters.sh are measured against. Idempotent.
echo "==> Setting a ${FREEZE_DAYS}-day freezing threshold..."
for c in "${ALL_CANISTERS[@]}"; do
  icp canister settings update "$c" --freezing-threshold $(( FREEZE_DAYS * 86400 )) -e "$ENVIRONMENT" >/dev/null \
    || echo "   (could not set the freezing threshold on $c)"
done

# A failed top-up is a warning, not a failed deploy: the canisters are
# already upgraded. The workflow's cycle health gate and the hourly watchdog
# fail loudly if a canister is actually close to freezing.
echo "==> Topping up canisters that are low on cycles..."
bash "$SCRIPT_DIR/top-up-canisters.sh" "$ENVIRONMENT" \
  || gh_warning "Cycle top-up failed" "Deployed, but some canisters could not be topped up. Fund the deploying identity and run: bash scripts/top-up-canisters.sh $ENVIRONMENT"

print_snapshots
echo "==> Done. Canister IDs:"
icp canister status -e "$ENVIRONMENT" --id-only
