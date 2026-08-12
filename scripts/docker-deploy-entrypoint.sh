#!/usr/bin/env bash
set -euo pipefail

# Entrypoint for the deploy Docker image (docker/deploy.Dockerfile).
# Imports an identity if one was passed in, then runs the normal deploy
# script — same logic as every other caller, just containerized.
#
# Usage: docker run -e DFX_IDENTITY_PEM="$(cat key.pem)" <image> staging

NETWORK="${1:-local}"
MODE="${2:-full}"

if [ -n "${DFX_IDENTITY_PEM:-}" ]; then
  bash scripts/import-identity.sh
fi

bash scripts/deploy.sh "$NETWORK" "$MODE"
