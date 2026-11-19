#!/usr/bin/env bash
set -euo pipefail

# Sends pending streak notifications (frontend/scripts/send-pending-push.mjs).
# Credentials come from the environment only, never from files. Set any of:
#   website  VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT
#            (npx --prefix frontend web-push generate-vapid-keys)
#   iOS      APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID
#   Android  FCM_SERVICE_ACCOUNT_JSON
# A channel without its credentials is skipped and its notifications wait.
# Example:
#   VAPID_PRIVATE_KEY=... VAPID_PUBLIC_KEY=... VAPID_SUBJECT=mailto:you@example.com \
#     bash scripts/send-push.sh

NETWORK="${1:-local}"
cd "$(dirname "$0")/../frontend"
node scripts/send-pending-push.mjs "$NETWORK"
