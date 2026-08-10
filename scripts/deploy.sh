#!/usr/bin/env bash
set -euo pipefail

NETWORK="${1:-local}"
ENV_FILE=".env"

echo "==> Deploying OfficialIQ to network: $NETWORK"

# Start local replica if needed
if [[ "$NETWORK" == "local" ]]; then
  dfx ping local 2>/dev/null || dfx start --background --clean
fi

# Deploy all canisters
CANISTERS=(user content question exam ranking challenge ai_proxy assets)
for c in "${CANISTERS[@]}"; do
  echo "--> Deploying $c..."
  dfx deploy "$c" --network "$NETWORK" --yes
done

# Write canister IDs to .env for Vite
echo "==> Writing canister IDs to $ENV_FILE"
{
  echo "DFX_NETWORK=$NETWORK"
  for c in user content question exam ranking challenge; do
    ID=$(dfx canister id "$c" --network "$NETWORK" 2>/dev/null || echo "")
    KEY="CANISTER_ID_$(echo "$c" | tr '[:lower:]' '[:upper:]')"
    echo "$KEY=$ID"
  done
} > "$ENV_FILE"

echo "==> Done. Canister IDs:"
cat "$ENV_FILE"
