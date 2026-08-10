#!/usr/bin/env bash
set -euo pipefail

NETWORK="${1:-local}"
cd "$(dirname "$0")/../frontend"
node scripts/seed-content.mjs "$NETWORK"
