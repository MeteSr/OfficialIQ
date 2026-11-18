#!/usr/bin/env bash
set -euo pipefail

# ELEVENLABS_API_KEY must be set in the environment before calling this
# script — it is never read from a file. Example:
#   ELEVENLABS_API_KEY=sk_... bash scripts/generate-audio.sh

if [ -z "${ELEVENLABS_API_KEY:-}" ]; then
  echo "ELEVENLABS_API_KEY is not set. Run: ELEVENLABS_API_KEY=sk_... bash scripts/generate-audio.sh" >&2
  exit 1
fi

NETWORK="${1:-local}"
cd "$(dirname "$0")/../frontend"
node scripts/generate-audio.mjs "$NETWORK"
