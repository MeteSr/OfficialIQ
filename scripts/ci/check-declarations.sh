#!/usr/bin/env bash
# Fails when the committed Candid (backend/<name>/<name>.did) or frontend
# bindings (frontend/src/declarations/) don't match the Motoko source, i.e.
# someone changed a canister's interface without running
# scripts/generate-declarations.sh. The diff it prints is the fix.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

bash scripts/generate-declarations.sh

if ! git diff --exit-code -- 'backend/*/*.did' frontend/src/declarations mops.toml \
   || [ -n "$(git ls-files --others --exclude-standard -- backend frontend/src/declarations)" ]; then
  git status --short -- backend frontend/src/declarations mops.toml
  echo "::error title=Generated interfaces are stale::Run scripts/generate-declarations.sh and commit the result."
  exit 1
fi
echo "Candid and frontend bindings match the canisters."
