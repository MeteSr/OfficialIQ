#!/usr/bin/env bash
# OfficialIQ — cycle top-up.
#
# Tops up every canister whose balance is within TOPUP_MARGIN_DAYS of its
# freezing threshold (or under the floor) back up to the target in
# scripts/lib/canisters.sh. Cycles come from the active identity's cycles
# wallet (`dfx canister deposit-cycles`).
#
# Run by deploy.sh after every real-network deploy and hourly by the Cycle
# Watchdog workflow; safe to run by hand any time.
#
# Usage:
#   bash scripts/top-up-canisters.sh <network> [--dry-run]     # staging | ic
#
# Exits non-zero when a top-up failed (usually: the wallet is empty).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
source "$SCRIPT_DIR/lib/canisters.sh"

NETWORK="${1:?usage: scripts/top-up-canisters.sh <staging|ic> [--dry-run]}"
DRY_RUN=false
[ "${2:-}" = "--dry-run" ] && DRY_RUN=true
export DFX_WARNING="${DFX_WARNING:--mainnet_plaintext_identity}"

if [ "$NETWORK" = "local" ]; then
  echo "Local network: cycles aren't metered, nothing to top up."
  exit 0
fi

echo "============================================"
echo "  OfficialIQ — Cycle Top-Up ($NETWORK)"
echo "  Top up when : < ${TOPUP_MARGIN_DAYS} days before the ${FREEZE_DAYS}-day freezing threshold, or < $(cycles_t "$MIN_TOPUP_CYCLES")"
$DRY_RUN && echo "  Mode        : DRY RUN (no changes)"
echo "============================================"

FAILED=()
for c in "${ALL_CANISTERS[@]}"; do
  [ -z "$(canister_id "$c" "$NETWORK")" ] && continue
  STATUS=$(canister_status "$c" "$NETWORK" || true)
  if ! cycles_read "$STATUS"; then
    echo "  ❓  $c — balance unknown, skipping"
    continue
  fi
  cycles_policy "$CYC_BALANCE" "$CYC_IDLE_PER_DAY"
  if [ "$CYC_BALANCE" -ge "$CYC_TOPUP_AT" ]; then
    echo "  🟢  $c — $(cycles_t "$CYC_BALANCE") (${CYC_RUNWAY_DAYS} days before freezing)"
    continue
  fi
  AMOUNT=$(( CYC_TARGET - CYC_BALANCE ))
  if $DRY_RUN; then
    echo "  🟡  $c — $(cycles_t "$CYC_BALANCE"), would add $(cycles_t "$AMOUNT")"
  elif dfx canister deposit-cycles "$AMOUNT" "$c" --network "$NETWORK" >/dev/null 2>&1; then
    echo "  ✓  $c — added $(cycles_t "$AMOUNT"), now ~$(cycles_t "$CYC_TARGET")"
  else
    echo "  ✗  $c — top-up of $(cycles_t "$AMOUNT") failed"
    FAILED+=("$c")
  fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "❌  Top-up failed for: ${FAILED[*]}. Fund the wallet ($(dfx identity get-wallet --network "$NETWORK" 2>/dev/null)) and run this again."
  exit 1
fi
echo "✅  Top-up done."
