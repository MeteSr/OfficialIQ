#!/usr/bin/env bash
set -euo pipefail

# Deploys every canister in icp.yaml to an environment: local, staging, or
# ic (production). One `icp deploy` builds the Motoko canisters (mops),
# creates any that don't exist, upgrades the rest, injects every canister's
# ID into every canister (PUBLIC_CANISTER_ID:<name>), then syncs the
# frontend — whose presync step builds it against those IDs.
#
# Usage: scripts/deploy.sh [environment] [mode]
#   environment  local (default) | staging | ic
#   mode         full (default) | assets-only (frontend only, for frontend fixes)

ENVIRONMENT="${1:-local}"
MODE="${2:-full}"
MIN_CYCLES_TRILLION=1   # heads-up threshold, not a hard technical minimum — see docs/DEPLOYMENT.md

cd "$(dirname "$0")/.."
echo "==> Deploying OfficialIQ to environment: $ENVIRONMENT ($MODE)"

# Reproducible Motoko dependencies: with a committed mops.lock, fail rather
# than silently re-resolve.
if [[ -f mops.lock ]]; then mops install --locked; else mops install; fi

if [[ "$ENVIRONMENT" == "local" ]]; then
  # The local network is per project; starting one that's already running
  # is a no-op error we can ignore.
  icp network start -d 2>/dev/null || true
else
  # Mainnet (staging/ic): canister creation and top-ups spend from the
  # deploying identity's cycles-ledger balance, not a wallet canister.
  # Refuse to start a multi-canister deploy that would run dry halfway.
  BALANCE_RAW=$(icp cycles balance -e "$ENVIRONMENT" -q 2>/dev/null | tr -dc '0-9' || true)
  BALANCE_TC=$(( ${BALANCE_RAW:-0} / 1000000000000 ))
  if [[ "$BALANCE_TC" -lt "$MIN_CYCLES_TRILLION" ]]; then
    echo "!! Identity $(icp identity default) has under ${MIN_CYCLES_TRILLION}T cycles on '$ENVIRONMENT' — top it up before deploying." >&2
    echo "   New canisters need ~2.1T cycles each. See docs/DEPLOYMENT.md for funding." >&2
    exit 1
  fi
  echo "==> Identity $(icp identity default) has ~${BALANCE_TC}T cycles."
fi

if [[ "$MODE" == "assets-only" ]]; then
  icp deploy frontend -e "$ENVIRONMENT"
else
  icp deploy -e "$ENVIRONMENT"
fi

if [[ "$ENVIRONMENT" != "local" ]]; then
  echo "==> Post-deploy cycles balance:"
  bash scripts/check-cycles.sh "$ENVIRONMENT"
fi

echo "==> Done. Canister IDs:"
icp canister status -e "$ENVIRONMENT" --id-only
