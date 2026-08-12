#!/usr/bin/env bash
set -euo pipefail

# Imports and activates a dfx identity from a PEM, for automated/headless
# deploys. Host-agnostic on purpose — GitHub Actions, GitLab CI, a bare cron
# job, or a human all call this the same way. See docs/DEPLOYMENT.md's
# "Deploying without GitHub" section.
#
# Usage:
#   DFX_IDENTITY_PEM="$(cat my-key.pem)" bash scripts/import-identity.sh
#   bash scripts/import-identity.sh path/to/my-key.pem
#
# The PEM itself is never written anywhere durable — it's read from the
# environment variable or the given file, dropped into a temp file only
# long enough for `dfx identity import`, then deleted.

IDENTITY_NAME="${DFX_IDENTITY_NAME:-ci}"
PEM_FILE_ARG="${1:-}"

TMP_PEM="$(mktemp)"
trap 'rm -f "$TMP_PEM"' EXIT

if [ -n "$PEM_FILE_ARG" ]; then
  cp "$PEM_FILE_ARG" "$TMP_PEM"
elif [ -n "${DFX_IDENTITY_PEM:-}" ]; then
  echo "$DFX_IDENTITY_PEM" > "$TMP_PEM"
else
  echo "!! No identity provided. Pass a PEM file path, or set DFX_IDENTITY_PEM." >&2
  echo "   See docs/DEPLOYMENT.md for how to create one." >&2
  exit 1
fi

dfx identity import "$IDENTITY_NAME" "$TMP_PEM" --storage-mode plaintext --force
dfx identity use "$IDENTITY_NAME"
echo "==> Using dfx identity '$IDENTITY_NAME' ($(dfx identity get-principal))"
