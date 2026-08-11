#!/usr/bin/env bash
set -euo pipefail

NETWORK="${1:-local}"
ENV_FILE=".env"

echo "==> Deploying OfficialIQ to network: $NETWORK"

# Start local replica if needed
if [[ "$NETWORK" == "local" ]]; then
  dfx ping local 2>/dev/null || dfx start --background --clean
fi

# Deploy backend canisters first (assets needs frontend/dist, which needs
# these canister IDs, so it must come after the .env write + frontend build)
BACKEND_CANISTERS=(user content question exam ranking challenge ai_proxy mentorship association report)
for c in "${BACKEND_CANISTERS[@]}"; do
  echo "--> Deploying $c..."
  dfx deploy "$c" --network "$NETWORK" --yes
done

# Write canister IDs to .env for Vite
echo "==> Writing canister IDs to $ENV_FILE"
{
  echo "DFX_NETWORK=$NETWORK"
  for c in "${BACKEND_CANISTERS[@]}"; do
    ID=$(dfx canister id "$c" --network "$NETWORK" 2>/dev/null || echo "")
    KEY="CANISTER_ID_$(echo "$c" | tr '[:lower:]' '[:upper:]')"
    echo "$KEY=$ID"
  done
} > "$ENV_FILE"

# Build the frontend with canister IDs baked in, then deploy assets
echo "==> Building frontend..."
(cd frontend && npm install && npm run build)

echo "--> Deploying assets..."
dfx deploy assets --network "$NETWORK" --yes

echo "==> Done. Canister IDs:"
cat "$ENV_FILE"
