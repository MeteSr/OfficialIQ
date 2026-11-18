#!/usr/bin/env bash
set -euo pipefail

# Installs the pinned ICP toolchain (icp-cli, ic-wasm, mops — versions in
# tools/package.json, kept current by Dependabot) and puts it on PATH.
# Shared by the GitHub Actions workflows, GitLab CI and the deploy Docker
# image — nothing here is GitHub-specific. See docs/DEPLOYMENT.md.
#
# For day-to-day local work the icp-cli skill's global install is fine too:
#   npm install -g @icp-sdk/icp-cli @icp-sdk/ic-wasm ic-mops

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
npm ci --prefix "$ROOT/tools" --no-audit --no-fund
BIN_DIR="$ROOT/tools/node_modules/.bin"

if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$BIN_DIR" >> "$GITHUB_PATH"
else
  echo "Add $BIN_DIR to PATH (not running under GitHub Actions, so this wasn't done automatically):"
  echo "  export PATH=\"$BIN_DIR:\$PATH\""
fi
"$BIN_DIR/icp" --version
