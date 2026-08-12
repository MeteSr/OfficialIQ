#!/usr/bin/env bash
set -euo pipefail

# Writes canister IDs for an already-deployed network into .env, without
# deploying anything. Split out of deploy.sh so callers that only need to
# *read* canister IDs (e.g. the push relay — see scripts/send-push.sh)
# don't have to run a full deploy just to populate .env.
#
# Usage: scripts/write-env.sh [network]   (defaults to "local")

NETWORK="${1:-local}"
ENV_FILE=".env"
BACKEND_CANISTERS=(user content question exam ranking challenge ai_proxy mentorship association report)

{
  echo "DFX_NETWORK=$NETWORK"
  for c in "${BACKEND_CANISTERS[@]}"; do
    ID=$(dfx canister id "$c" --network "$NETWORK" 2>/dev/null || echo "")
    KEY="CANISTER_ID_$(echo "$c" | tr '[:lower:]' '[:upper:]')"
    echo "$KEY=$ID"
  done
} > "$ENV_FILE"
