#!/usr/bin/env bash
set -euo pipefail

# Imports an icp-cli identity from a PEM and makes it the default, for
# automated/headless deploys. Host-agnostic on purpose — GitHub Actions,
# GitLab CI, a bare cron job, or a human all call this the same way. See
# docs/DEPLOYMENT.md's "Deploying without GitHub" section.
#
# Usage:
#   ICP_IDENTITY_PEM="$(cat my-key.pem)" bash scripts/import-identity.sh
#   bash scripts/import-identity.sh path/to/my-key.pem
#
# DFX_IDENTITY_PEM is still accepted so existing CI secrets keep working;
# a PEM exported from dfx imports unchanged (same principal).
#
# The PEM itself is never written anywhere durable by this script — it's
# read from the environment variable or the given file, dropped into a temp
# file only long enough for `icp identity import`, then deleted. CI runners
# have no OS keyring, so the identity is stored as plaintext inside the
# (ephemeral) runner's icp home — never do this on a machine you keep.

IDENTITY_NAME="${ICP_IDENTITY_NAME:-${DFX_IDENTITY_NAME:-ci}}"
PEM_FILE_ARG="${1:-}"
PEM_VALUE="${ICP_IDENTITY_PEM:-${DFX_IDENTITY_PEM:-}}"

TMP_PEM="$(mktemp)"
trap 'rm -f "$TMP_PEM"' EXIT

if [ -n "$PEM_FILE_ARG" ]; then
  cp "$PEM_FILE_ARG" "$TMP_PEM"
elif [ -n "$PEM_VALUE" ]; then
  echo "$PEM_VALUE" > "$TMP_PEM"
else
  echo "!! No identity provided. Pass a PEM file path, or set ICP_IDENTITY_PEM." >&2
  echo "   See docs/DEPLOYMENT.md for how to create one." >&2
  exit 1
fi

# Re-runs replace the identity (the default one can't be deleted, so step
# off it first).
if icp identity list 2>/dev/null | grep -qw "$IDENTITY_NAME"; then
  icp identity default anonymous >/dev/null
  icp identity delete "$IDENTITY_NAME" >/dev/null
fi
icp identity import "$IDENTITY_NAME" --from-pem "$TMP_PEM" --storage plaintext
icp identity default "$IDENTITY_NAME"
echo "==> Using icp identity '$IDENTITY_NAME' ($(icp identity principal))"
