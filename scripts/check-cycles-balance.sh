#!/usr/bin/env bash
# OfficialIQ — deploy cycles pre-flight.
#
# icp-cli has no wallet canister: creating and topping up canisters spends
# the deploying identity's cycles-ledger balance. This checks that balance
# before deploy.sh starts, so a deploy fails up front instead of halfway
# through, with some canisters upgraded and others not. The requirement is
# computed, not guessed: a baseline floor, plus PER_NEW_CANISTER_CYCLES for
# every canister with no ID yet in this environment (`icp deploy` funds a new
# canister with 2T, plus the creation fee). An upgrade where every canister
# already exists only needs the baseline.
#
# Also logs the live balance of every canister that already exists, so one
# quietly running low shows up here rather than as a failed upgrade.
#
# Usage:
#   bash scripts/check-cycles-balance.sh <environment>     # staging | ic
#
# Environment:
#   MIN_DEPLOY_CYCLES       — baseline floor (default: 1T)
#   PER_NEW_CANISTER_CYCLES — required per canister still to be created (default: 2.5T)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
source "$SCRIPT_DIR/lib/canisters.sh"

ENVIRONMENT="${1:?usage: scripts/check-cycles-balance.sh <staging|ic>}"
MIN_DEPLOY_CYCLES="${MIN_DEPLOY_CYCLES:-1000000000000}"               # 1T
PER_NEW_CANISTER_CYCLES="${PER_NEW_CANISTER_CYCLES:-2500000000000}"   # 2.5T

if [ "$ENVIRONMENT" = "local" ]; then
  echo "Local network: cycles aren't metered, nothing to check."
  exit 0
fi

TO_CREATE=()
for c in "${ALL_CANISTERS[@]}"; do
  [ -z "$(canister_id "$c" "$ENVIRONMENT")" ] && TO_CREATE+=("$c")
done
REQUIRED=$(( MIN_DEPLOY_CYCLES + ${#TO_CREATE[@]} * PER_NEW_CANISTER_CYCLES ))
IDENTITY="$(icp identity default 2>/dev/null) ($(icp identity principal 2>/dev/null))"

echo "============================================"
echo "  OfficialIQ — Deploy Pre-flight ($ENVIRONMENT)"
echo "  Identity       : $IDENTITY"
echo "  Baseline floor : $(cycles_t "$MIN_DEPLOY_CYCLES")"
echo "  New canisters  : ${#TO_CREATE[@]} × $(cycles_t "$PER_NEW_CANISTER_CYCLES")${TO_CREATE[*]:+ (${TO_CREATE[*]})}"
echo "  Required       : $(cycles_t "$REQUIRED")"
echo "============================================"

BALANCE=$(identity_cycles "$ENVIRONMENT")
if ! [[ "$BALANCE" =~ ^[0-9]+$ ]]; then
  echo "❌  Could not read the cycles balance of $IDENTITY: $(icp cycles balance -e "$ENVIRONMENT" 2>&1 | tail -1)"
  exit 1
fi
echo "  Cycles balance : $(cycles_t "$BALANCE")"

# Best-effort: a status read failing here shouldn't block the gate, which is
# about the identity's balance. check-cycle-health.sh is the strict one.
echo ""
echo "── Existing canister balances ──"
for c in "${ALL_CANISTERS[@]}"; do
  if printf '%s\n' "${TO_CREATE[@]:-}" | grep -qx "$c"; then
    echo "  ⬜  $c — not created yet"
    continue
  fi
  if STATUS=$(canister_status "$c" "$ENVIRONMENT") && cycles_read "$STATUS"; then
    echo "  🟢  $c — $(cycles_t "$CYC_BALANCE")"
  else
    echo "  ❓  $c — could not read balance"
  fi
done
echo ""

if [ "$BALANCE" -lt "$REQUIRED" ]; then
  echo "❌  Not enough cycles: $IDENTITY holds $(cycles_t "$BALANCE"), this deploy needs $(cycles_t "$REQUIRED")."
  echo "    Top up: icp cycles mint --icp <amount> -n ic   (docs/DEPLOYMENT.md → \"Fund the identity with cycles\")"
  exit 1
fi

echo "✅  Pre-flight passed."
