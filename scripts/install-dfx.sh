#!/usr/bin/env bash
set -euo pipefail

# Installs dfx (the DFINITY Canister SDK) if it isn't already on PATH.
# Factored out so it's shared by the GitHub Actions workflows, the
# Dockerfile, and any other CI/host that runs a deploy — none of this is
# GitHub-specific. See docs/DEPLOYMENT.md's "Deploying without GitHub"
# section.

if command -v dfx >/dev/null 2>&1; then
  echo "dfx already installed: $(dfx --version)"
  exit 0
fi

DFXVM_INIT_YES=true sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"

DFX_BIN_DIR="$HOME/.local/share/dfx/bin"
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$DFX_BIN_DIR" >> "$GITHUB_PATH"
else
  echo "Add $DFX_BIN_DIR to PATH (not running under GitHub Actions, so this wasn't done automatically)."
fi
