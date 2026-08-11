#!/usr/bin/env bash
set -euo pipefail

# ANTHROPIC_API_KEY must be set in the environment before calling this
# script — it is never read from a file. Example:
#   ANTHROPIC_API_KEY=sk-ant-... bash scripts/set-ai-config.sh

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ANTHROPIC_API_KEY is not set. Run: ANTHROPIC_API_KEY=sk-ant-... bash scripts/set-ai-config.sh" >&2
  exit 1
fi

NETWORK="${1:-local}"
cd "$(dirname "$0")/../frontend"
node scripts/set-ai-config.mjs "$NETWORK"
