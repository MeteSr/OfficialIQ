#!/usr/bin/env bash
set -euo pipefail

# Prints the web origin the mobile apps sign in through and, in GitHub
# Actions, writes its host to $GITHUB_OUTPUT as `host` (the Android App Link
# host and the iOS associated domain). Fails if production hasn't been
# deployed, because the apps are built against production's canister IDs.
#
# The origin is NATIVE_WEB_ORIGIN when set (a custom domain), otherwise the
# production frontend canister's icp0.io address — the same rule as
# frontend/vite.config.ts, which bakes it into the app.

cd "$(dirname "$0")/.."
MAPPINGS=".icp/data/mappings/ic.ids.json"

if [[ ! -f "$MAPPINGS" ]] || ! jq -e '.frontend and .user' "$MAPPINGS" >/dev/null; then
  echo "::error::$MAPPINGS has no production canister IDs. Run the production deploy first (docs/DEPLOYMENT.md); the apps are built against it."
  exit 1
fi

if [[ -n "${NATIVE_WEB_ORIGIN:-}" ]]; then
  ORIGIN="${NATIVE_WEB_ORIGIN%/}"
else
  ORIGIN="https://$(jq -r .frontend "$MAPPINGS").icp0.io"
fi
HOST="${ORIGIN#https://}"
HOST="${HOST%%/*}"

echo "Native sign-in origin: $ORIGIN"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "host=$HOST" >> "$GITHUB_OUTPUT"
fi
