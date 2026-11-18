#!/usr/bin/env bash
# OfficialIQ — post-deploy smoke test against a live network.
#
# Run by the deploy workflows right after scripts/deploy.sh, so a deploy that
# "succeeded" but left something down fails the run instead of being found by
# a user:
#   1. every canister is Running;
#   2. every backend canister's code answers (each exports a metrics() query);
#   3. the frontend canister serves the app's index page.
#
# Usage:
#   bash scripts/smoke-deployed.sh <environment>     # local | staging | ic
#
# Environment:
#   FRONTEND_URL — override the URL checked in step 3 (e.g. a custom domain).
#                  Default: https://<frontend-id>.icp0.io/ (local: the local network).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
source "$SCRIPT_DIR/lib/canisters.sh"

NETWORK="${1:-local}"
FAILED=()
fail() { echo "  ✗ $1"; FAILED+=("$1"); }

echo "============================================"
echo "  OfficialIQ — Post-deploy smoke ($NETWORK)"
echo "============================================"

echo "▶ Canisters are running"
for c in "${ALL_CANISTERS[@]}"; do
  if [ -z "$(canister_id "$c" "$NETWORK")" ]; then fail "$c is not deployed on $NETWORK"; continue; fi
  state=$(status_field "$(canister_status "$c" "$NETWORK" || true)" "Status")
  if [ "$state" = "Running" ]; then echo "  ✓ $c"; else fail "$c is ${state:-unreachable}"; fi
done

echo "▶ Deployed code answers"
for c in "${BACKEND_CANISTERS[@]}"; do
  [ -z "$(canister_id "$c" "$NETWORK")" ] && continue
  out=$(icp canister call "$c" metrics '()' --query -e "$NETWORK" 2>&1 || true)
  if [[ "$out" == "(record"* ]]; then echo "  ✓ $c.metrics"; else fail "$c.metrics: $(printf '%s' "$out" | tail -1)"; fi
done

echo "▶ Frontend serves the app"
ASSETS_ID=$(canister_id frontend "$NETWORK")
if [ -n "$ASSETS_ID" ]; then
  if [ -n "${FRONTEND_URL:-}" ]; then
    url="$FRONTEND_URL"
  elif [ "$NETWORK" = "local" ]; then
    url="http://$ASSETS_ID.localhost:8000/"
  else
    url="https://$ASSETS_ID.icp0.io/"
  fi
  # A fresh deploy can take a few seconds to reach every boundary node.
  for attempt in 1 2 3; do
    page=$(curl -fsS --max-time 30 "$url" 2>&1 || true)
    [[ "$page" == *'id="root"'* ]] && break
    sleep $(( attempt * 5 ))
  done
  if [[ "$page" == *'id="root"'* ]]; then echo "  ✓ $url"; else fail "$url did not serve the app"; fi
fi

echo ""
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "❌ Smoke test failed: ${#FAILED[@]} check(s)"
  exit 1
fi
echo "✅ Smoke test passed"
