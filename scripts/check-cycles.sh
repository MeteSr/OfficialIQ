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
  ERR_FILE=$(mktemp)
  STATUS=$(dfx canister status "$c" --network "$NETWORK" 2>"$ERR_FILE") && OK=1 || OK=0
  if [[ "$OK" -eq 0 ]]; then
    # "not deployed" and "deployed but this identity isn't a controller" are
    # different problems — conflating them (as an earlier version of this
    # script did) reads as a canister having vanished when it's often just
    # the wrong dfx identity active.
    if grep -q "is not part of the controllers" "$ERR_FILE"; then
      echo "$c: exists, but the active identity ($(dfx identity whoami)) isn't a controller — can't read balance"
    else
      echo "$c: not deployed on $NETWORK"
    fi
    rm -f "$ERR_FILE"
    continue
  fi
  rm -f "$ERR_FILE"
  BALANCE=$(echo "$STATUS" | grep -oE 'Balance: [0-9_,]+ Cycles' || echo "Balance: unknown")
  echo "$c: $BALANCE"
done
