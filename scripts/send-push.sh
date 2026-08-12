#!/usr/bin/env bash
set -euo pipefail

# VAPID_PRIVATE_KEY/VAPID_PUBLIC_KEY/VAPID_SUBJECT must be set in the
# environment before calling this script — the private key is never read
# from a file. Generate a key pair once with:
#   npx --prefix frontend web-push generate-vapid-keys
# Example:
#   VAPID_PRIVATE_KEY=... VAPID_PUBLIC_KEY=... VAPID_SUBJECT=mailto:you@example.com \
#     bash scripts/send-push.sh

if [ -z "${VAPID_PRIVATE_KEY:-}" ] || [ -z "${VAPID_PUBLIC_KEY:-}" ] || [ -z "${VAPID_SUBJECT:-}" ]; then
  echo "VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, and VAPID_SUBJECT must all be set." >&2
  echo "Generate a key pair with: npx --prefix frontend web-push generate-vapid-keys" >&2
  exit 1
fi

NETWORK="${1:-local}"
cd "$(dirname "$0")/../frontend"
node scripts/send-pending-push.mjs "$NETWORK"
