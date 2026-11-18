#!/usr/bin/env bash
set -euo pipefail

# Regenerates every canister's Candid interface and the frontend's bindings
# from the Motoko source:
#
#   backend/<name>/<name>.did                  mops generate candid (moc --idl)
#   frontend/src/declarations/<name>/index.ts  icp-bindgen, from that .did
#
# Run it after changing a canister's public interface and commit what it
# writes. CI runs it too and fails when the committed files differ
# (scripts/ci/check-declarations.sh), so the app's IDL can't drift from the
# canisters. Needs the toolchain from scripts/install-icp.sh and
# `mops install`.
#
# The .did files also gate `icp build`: mops.toml declares each one as the
# canister's interface, and mops build refuses a canister whose interface is
# no longer compatible with it.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=lib/canisters.sh
source scripts/lib/canisters.sh

PATH="$ROOT/tools/node_modules/.bin:$PATH"

mops generate candid "${BACKEND_CANISTERS[@]}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for name in "${BACKEND_CANISTERS[@]}"; do
  icp-bindgen \
    --did-file "backend/$name/$name.did" \
    --out-dir "$TMP/$name" \
    --actor-disabled \
    --declarations-typescript \
    --declarations-flat \
    --declarations-root-exports \
    --force >/dev/null
  mkdir -p "frontend/src/declarations/$name"
  # No canister takes init args, so the generated init() never reads its
  # IDL parameter, which the app's tsconfig (noUnusedParameters) rejects.
  perl -0pe 's/= \(\{ IDL \}\) => \{\n  return \[\];/= () => {\n  return [];/' \
    "$TMP/$name/$name.did.ts" > "frontend/src/declarations/$name/index.ts"
done

echo "Generated Candid and bindings for ${#BACKEND_CANISTERS[@]} canisters."
