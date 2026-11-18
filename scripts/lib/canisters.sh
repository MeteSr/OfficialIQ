# shellcheck shell=bash
# OfficialIQ — shared canister list, cycle policy and status helpers.
#
# Sourced by deploy.sh, check-cycles-balance.sh, check-cycle-health.sh,
# top-up-canisters.sh, smoke-deployed.sh and ops/release-manifest.sh so they
# all agree on which canisters exist and what "low on cycles" means.
#
# Thresholds are measured against each canister's own idle burn rather than a
# flat number: deploy.sh sets a 90-day freezing threshold on every mainnet
# canister, so a canister freezes once its balance drops below ~90 days of
# idle burn. The absolute floors cover call/compute burn, which the idle
# figure doesn't include.

FREEZE_DAYS=90                       # freezing threshold set by deploy.sh
ALERT_MARGIN_DAYS=30                 # alert when < 30 days remain before freezing
TOPUP_MARGIN_DAYS=60                 # top up when < 60 days remain before freezing
TARGET_MARGIN_DAYS=180               # top up to 180 days past the freezing threshold
MIN_ALERT_CYCLES=500000000000        # 0.5T — alert floor
MIN_TOPUP_CYCLES=1000000000000       # 1T   — top-up floor
MIN_TARGET_CYCLES=2000000000000      # 2T   — top-up target floor

# Backend canisters in deploy order. Keep in sync with icp.yaml / mops.toml.
BACKEND_CANISTERS=(user content question exam ranking challenge ai_proxy mentorship association report)
# Every canister a deploy creates, the frontend included.
ALL_CANISTERS=("${BACKEND_CANISTERS[@]}" frontend)

# canister_id <name> <env> — the canister's ID in <env> (from
# .icp/data/mappings/<env>.ids.json on mainnet, .icp/cache/ locally), or
# nothing if it hasn't been created there yet.
canister_id() {
  icp canister status "$1" -e "$2" --id-only 2>/dev/null || true
}

# canister_status <name> <env> — `icp canister status` text (stderr included,
# so a failure explains itself). Non-zero when the call fails.
canister_status() {
  icp canister status "$1" -e "$2" 2>&1
}

# status_field <status output> <label> — the value after "<label>:", with
# digit separators removed. icp indents every field, so leading space is fine.
status_field() {
  printf '%s\n' "$1" | grep -iE "^[[:space:]]*$2:" | head -1 \
    | sed -E 's/^[[:space:]]*[^:]*:[[:space:]]*//' | tr -d '_,'
}

# cycles_read <status output> — sets CYC_BALANCE and CYC_IDLE_PER_DAY.
# Returns 1 when the balance can't be parsed (not a controller, unreachable).
cycles_read() {
  CYC_BALANCE=$(status_field "$1" "Cycles")
  CYC_IDLE_PER_DAY=$(status_field "$1" "Idle cycles burned per day")
  [[ "$CYC_IDLE_PER_DAY" =~ ^[0-9]+$ ]] || CYC_IDLE_PER_DAY=0
  [[ "$CYC_BALANCE" =~ ^[0-9]+$ ]]
}

_cyc_max() { if [ "$1" -gt "$2" ]; then echo "$1"; else echo "$2"; fi; }

# cycles_policy <balance> <idle per day> — sets CYC_ALERT_AT, CYC_TOPUP_AT,
# CYC_TARGET and CYC_RUNWAY_DAYS (days left before the freezing threshold
# bites, or "?" when the idle burn is unknown).
cycles_policy() {
  local balance=$1 idle=$2
  CYC_ALERT_AT=$(_cyc_max $(( idle * (FREEZE_DAYS + ALERT_MARGIN_DAYS) )) "$MIN_ALERT_CYCLES")
  CYC_TOPUP_AT=$(_cyc_max $(( idle * (FREEZE_DAYS + TOPUP_MARGIN_DAYS) )) "$MIN_TOPUP_CYCLES")
  CYC_TARGET=$(_cyc_max $(( idle * (FREEZE_DAYS + TARGET_MARGIN_DAYS) )) "$MIN_TARGET_CYCLES")
  if [ "$idle" -gt 0 ]; then
    CYC_RUNWAY_DAYS=$(( balance / idle - FREEZE_DAYS ))
  else
    CYC_RUNWAY_DAYS="?"
  fi
}

# cycles_t <n> — 1234567890000 → "1.23T"
cycles_t() { awk -v n="$1" 'BEGIN { printf "%.2fT", n / 1e12 }'; }

# identity_cycles <env> — the active identity's cycles-ledger balance, or nothing.
identity_cycles() {
  local b
  b=$(icp cycles balance -e "$1" -q 2>/dev/null | head -1 | tr -dc '0-9' || true)
  # The local network seeds an absurd balance that overflows bash arithmetic.
  if [ "${#b}" -gt 18 ]; then echo 999999999999999999; else echo "$b"; fi
}

# gh_warning <title> <message> — a GitHub Actions warning annotation plus a
# step-summary entry when running in Actions, a plain line otherwise.
gh_warning() {
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    echo "::warning title=$1::$2"
    [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '### ⚠️ %s\n\n%s\n' "$1" "$2" >> "$GITHUB_STEP_SUMMARY"
  else
    echo "⚠️  $1: $2"
  fi
  return 0
}
