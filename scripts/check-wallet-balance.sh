#!/usr/bin/env bash
# OfficialIQ — wallet cycles pre-flight check.
#
# Verifies the deploy identity's cycles wallet holds enough cycles before
# deploy.sh runs, so a deploy fails up front instead of halfway through and
# leaving some canisters upgraded and others not. The requirement is computed,
# not guessed: a baseline floor, plus PER_NEW_CANISTER_CYCLES for every
# canister with no ID yet in canister_ids.json (dfx funds a new canister with
# 3T from the wallet, plus install overhead). An upgrade where every canister
# already exists only needs the baseline.
#
# Also logs the live balance of every canister that already exists, so one
# quietly running low shows up here rather than as a failed upgrade call.
#
# Usage:
#   bash scripts/check-wallet-balance.sh <network>     # staging | ic
#
# Environment:
#   MIN_WALLET_CYCLES       — baseline floor (default: 1T)
#   PER_NEW_CANISTER_CYCLES — required per canister still to be created (default: 3.5T)
#   The active dfx identity must have a wallet set for <network>
#   (scripts/import-identity.sh does that when DFX_WALLET_ID is set).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
source "$SCRIPT_DIR/lib/canisters.sh"

NETWORK="${1:?usage: scripts/check-wallet-balance.sh <staging|ic>}"
MIN_WALLET_CYCLES="${MIN_WALLET_CYCLES:-1000000000000}"               # 1T
PER_NEW_CANISTER_CYCLES="${PER_NEW_CANISTER_CYCLES:-3500000000000}"   # 3.5T

if [ "$NETWORK" = "local" ]; then
  echo "Local network: cycles aren't metered, nothing to check."
  exit 0
fi

# dfx warns about plaintext identities on mainnet-facing networks; that's the
# documented CI setup, so silence the warning rather than let it pollute output.
export DFX_WARNING="${DFX_WARNING:--mainnet_plaintext_identity}"

TO_CREATE=()
for c in "${ALL_CANISTERS[@]}"; do
  [ -z "$(canister_id "$c" "$NETWORK")" ] && TO_CREATE+=("$c")
done
REQUIRED=$(( MIN_WALLET_CYCLES + ${#TO_CREATE[@]} * PER_NEW_CANISTER_CYCLES ))

echo "============================================"
echo "  OfficialIQ — Wallet Pre-flight ($NETWORK)"
echo "  Baseline floor : $(cycles_t "$MIN_WALLET_CYCLES")"
echo "  New canisters  : ${#TO_CREATE[@]} × $(cycles_t "$PER_NEW_CANISTER_CYCLES")${TO_CREATE[*]:+ (${TO_CREATE[*]})}"
echo "  Required       : $(cycles_t "$REQUIRED")"
echo "============================================"

WALLET=$(dfx identity get-wallet --network "$NETWORK" 2>/dev/null || true)
if [ -z "$WALLET" ]; then
  echo "❌  No cycles wallet configured for '$NETWORK' on identity $(dfx identity whoami 2>/dev/null)."
  echo "    Set DFX_WALLET_ID (CI) or run: dfx identity set-wallet <id> --network $NETWORK"
  echo "    See docs/DEPLOYMENT.md → \"Create and fund a cycles wallet\"."
  exit 1
fi

BALANCE_OUT=$(dfx wallet balance --precise --network "$NETWORK" 2>&1) || {
  echo "❌  Could not read the balance of wallet $WALLET: $BALANCE_OUT"
  exit 1
}
BALANCE=$(printf '%s\n' "$BALANCE_OUT" | grep -oE '^[0-9_]+' | head -1 | tr -d '_')
if ! [[ "$BALANCE" =~ ^[0-9]+$ ]]; then
  echo "❌  Could not parse the wallet balance from: $BALANCE_OUT"
  exit 1
fi
echo "  Wallet $WALLET: $(cycles_t "$BALANCE")"

# Best-effort: a status read failing here shouldn't block the gate, which is
# about the wallet. check-cycle-health.sh is the strict one.
echo ""
echo "── Existing canister balances ──"
for c in "${ALL_CANISTERS[@]}"; do
  if printf '%s\n' "${TO_CREATE[@]:-}" | grep -qx "$c"; then
    echo "  ⬜  $c — not created yet"
    continue
  fi
  if STATUS=$(canister_status "$c" "$NETWORK") && cycles_read "$STATUS"; then
    echo "  🟢  $c — $(cycles_t "$CYC_BALANCE")"
  else
    echo "  ❓  $c — could not read balance"
  fi
done
echo ""

if [ "$BALANCE" -lt "$REQUIRED" ]; then
  echo "❌  Not enough cycles: the wallet has $(cycles_t "$BALANCE"), this deploy needs $(cycles_t "$REQUIRED")."
  echo "    Top up: dfx ledger top-up $WALLET --amount <ICP> --network $NETWORK"
  echo "    (docs/DEPLOYMENT.md → \"Topping up\")"
  exit 1
fi

echo "✅  Wallet pre-flight passed."
