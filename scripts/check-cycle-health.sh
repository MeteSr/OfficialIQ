#!/usr/bin/env bash
# OfficialIQ — cycle health check.
#
# Reads every canister's balance and exits non-zero when any canister is close
# to its freezing threshold, or when a balance can't be read at all (a wrong
# identity would otherwise make every canister "unknown" and the check pass).
# Thresholds live in scripts/lib/canisters.sh.
#
# Run after every real-network deploy (the deploy fails if this does) and
# hourly by the Cycle Watchdog workflow.
#
# Usage:
#   bash scripts/check-cycle-health.sh <environment>     # local | staging | ic
#   The active icp identity must be a controller of the canisters.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
source "$SCRIPT_DIR/lib/canisters.sh"

NETWORK="${1:-local}"

echo "============================================"
echo "  OfficialIQ — Cycle Health ($NETWORK)"
echo "  Alert when : < ${ALERT_MARGIN_DAYS} days before the ${FREEZE_DAYS}-day freezing threshold, or < $(cycles_t "$MIN_ALERT_CYCLES")"
echo "============================================"

CRITICAL=(); UNKNOWN=(); CHECKED=0

for c in "${ALL_CANISTERS[@]}"; do
  if [ -z "$(canister_id "$c" "$NETWORK")" ]; then
    echo "  ⬜  $c — not deployed on $NETWORK, skipping"
    continue
  fi
  CHECKED=$(( CHECKED + 1 ))

  STATUS=$(canister_status "$c" "$NETWORK" || true)
  if ! cycles_read "$STATUS"; then
    # "Not a controller" and "unreachable" need different fixes, so show why.
    echo "  ❓  $c — could not read balance (identity $(icp identity default 2>/dev/null) is not a controller, or the network is unreachable)"
    printf '%s\n' "$STATUS" | tail -2 | sed 's/^/        /'
    UNKNOWN+=("$c")
    continue
  fi

  cycles_policy "$CYC_BALANCE" "$CYC_IDLE_PER_DAY"
  if [ "$CYC_BALANCE" -lt "$CYC_ALERT_AT" ]; then
    echo "  🔴  $c — $(cycles_t "$CYC_BALANCE"), ${CYC_RUNWAY_DAYS} days before freezing (alert below $(cycles_t "$CYC_ALERT_AT"))"
    CRITICAL+=("$c")
  elif [ "$CYC_BALANCE" -lt "$CYC_TOPUP_AT" ]; then
    echo "  🟡  $c — $(cycles_t "$CYC_BALANCE"), ${CYC_RUNWAY_DAYS} days before freezing (top-up due)"
  else
    echo "  🟢  $c — $(cycles_t "$CYC_BALANCE"), ${CYC_RUNWAY_DAYS} days before freezing"
  fi
done

echo ""
echo "  Checked: $CHECKED   Critical: ${#CRITICAL[@]}   Unknown: ${#UNKNOWN[@]}"

FAILED=0
if [ "$CHECKED" -eq 0 ]; then
  echo "❌  No canisters deployed on '$NETWORK'"
  FAILED=1
fi
if [ ${#UNKNOWN[@]} -gt 0 ]; then
  echo "❌  Could not read: ${UNKNOWN[*]} — check that the active identity controls these canisters"
  FAILED=1
fi
if [ ${#CRITICAL[@]} -gt 0 ]; then
  echo "❌  Top up now: ${CRITICAL[*]}   (bash scripts/top-up-canisters.sh $NETWORK)"
  FAILED=1
fi
[ "$FAILED" -eq 0 ] && echo "✅  Cycle health check passed"
exit "$FAILED"
