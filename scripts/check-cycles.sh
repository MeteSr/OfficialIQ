#!/usr/bin/env bash
set -euo pipefail

# Reports remaining cycles for every canister on the given network. Cycles
# funding itself is a business decision (see BUSINESS.md #7) — this script
# just makes it easy to see when a canister is running low before it freezes.
#
# Usage: scripts/check-cycles.sh [network]   (defaults to "local")

NETWORK="${1:-local}"
CANISTERS=(user content question exam ranking challenge ai_proxy mentorship association report assets)

for c in "${CANISTERS[@]}"; do
  STATUS=$(dfx canister status "$c" --network "$NETWORK" 2>/dev/null || echo "")
  if [[ -z "$STATUS" ]]; then
    echo "$c: not deployed on $NETWORK"
    continue
  fi
  BALANCE=$(echo "$STATUS" | grep -oE 'Balance: [0-9_,]+ Cycles' || echo "Balance: unknown")
  echo "$c: $BALANCE"
done
