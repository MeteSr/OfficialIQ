#!/usr/bin/env bash
set -euo pipefail

NETWORK="${1:-local}"
MODE="${2:-full}"   # full | assets-only (assets-only skips the backend-canister loop, for frontend-only fixes)
ENV_FILE=".env"
MIN_CYCLES_TRILLION=1   # heads-up threshold, not a hard technical minimum — see docs/DEPLOYMENT.md

echo "==> Deploying OfficialIQ to network: $NETWORK ($MODE)"

BACKEND_CANISTERS=(user content question exam ranking challenge ai_proxy mentorship association report)

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
  # Real network (staging/ic): refuse to proceed on a missing wallet or a
  # wallet that's nearly out of cycles, rather than fail halfway through a
  # multi-canister deploy. See docs/DEPLOYMENT.md for wallet setup/funding.
  #
  # Deliberately NOT trusting `dfx identity get-wallet`'s exit code alone —
  # for a plaintext-stored identity (the documented CI setup) against a
  # mainnet-facing network, dfx prints an "insecure identity" warning whose
  # effect on the exit code is inconsistent (observed both 0 and 1 for the
  # same underlying "no wallet" condition). Checking that $WALLET actually
  # came back non-empty is the reliable signal.
  export DFX_WARNING="-mainnet_plaintext_identity"
  WALLET=$(dfx identity get-wallet --network "$NETWORK" 2>/dev/null || true)
  if [[ -z "$WALLET" ]]; then
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
