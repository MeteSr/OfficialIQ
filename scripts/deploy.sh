#!/usr/bin/env bash
set -euo pipefail

NETWORK="${1:-local}"
MODE="${2:-full}"   # full | assets-only (assets-only skips the backend-canister loop, for frontend-only fixes)
ENV_FILE=".env"
MIN_CYCLES_TRILLION=1   # heads-up threshold, not a hard technical minimum — see docs/DEPLOYMENT.md

echo "==> Deploying OfficialIQ to network: $NETWORK ($MODE)"

BACKEND_CANISTERS=(user content question exam ranking challenge ai_proxy mentorship association report)

if [[ "$NETWORK" == "local" ]]; then
  # Start local replica if needed
  dfx ping local 2>/dev/null || dfx start --background --clean
else
  # Real network (staging/ic): refuse to proceed on a missing wallet or a
  # wallet that's nearly out of cycles, rather than fail halfway through a
  # multi-canister deploy. See docs/DEPLOYMENT.md for wallet setup/funding.
  if ! WALLET=$(dfx identity get-wallet --network "$NETWORK" 2>/dev/null); then
    echo "!! No cycles wallet configured for network '$NETWORK'." >&2
    echo "   Run 'dfx identity get-wallet --network $NETWORK' to diagnose, or see docs/DEPLOYMENT.md." >&2
    exit 1
  fi
  BALANCE_RAW=$(dfx wallet balance --network "$NETWORK" --precise 2>/dev/null | grep -oE '^[0-9]+' || echo "0")
  BALANCE_TC=$(( BALANCE_RAW / 1000000000000 ))
  if [[ "$BALANCE_TC" -lt "$MIN_CYCLES_TRILLION" ]]; then
    echo "!! Wallet $WALLET has under ${MIN_CYCLES_TRILLION}T cycles on '$NETWORK' — top it up before deploying." >&2
    echo "   See docs/DEPLOYMENT.md for the funding process." >&2
    exit 1
  fi
  echo "==> Wallet $WALLET has ~${BALANCE_TC}T cycles on '$NETWORK'."
fi

if [[ "$MODE" != "assets-only" ]]; then
  # Deploy backend canisters first (assets needs frontend/dist, which needs
  # these canister IDs, so it must come after the .env write + frontend build)
  for c in "${BACKEND_CANISTERS[@]}"; do
    echo "--> Deploying $c..."
    dfx deploy "$c" --network "$NETWORK" --yes
  done
fi

# Write canister IDs to .env for Vite
echo "==> Writing canister IDs to $ENV_FILE"
bash "$(dirname "$0")/write-env.sh" "$NETWORK"

# Build the frontend with canister IDs baked in, then deploy assets
echo "==> Building frontend..."
(cd frontend && npm install && npm run build)

echo "--> Deploying assets..."
dfx deploy assets --network "$NETWORK" --yes

if [[ "$NETWORK" != "local" ]]; then
  echo "==> Post-deploy cycles balance:"
  bash "$(dirname "$0")/check-cycles.sh" "$NETWORK"
fi

echo "==> Done. Canister IDs:"
cat "$ENV_FILE"
