#!/usr/bin/env bash
# Prints what is running on a network: one line per canister with its ID and
# module hash (TSV). The production deploy attaches it to the GitHub release
# for the deploy's mainnet-* tag, so a module hash seen in
# `icp canister status` can be traced back to the commit that built it.
#
#   bash scripts/ops/release-manifest.sh ic > release-manifest.tsv
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."
source scripts/lib/canisters.sh
NETWORK="${1:-ic}"

printf 'canister\tcanister_id\tmodule_hash\n'
for name in "${ALL_CANISTERS[@]}"; do
  id=$(canister_id "$name" "$NETWORK")
  [ -n "$id" ] || continue
  hash=$(status_field "$(canister_status "$name" "$NETWORK" || true)" "Module hash")
  printf '%s\t%s\t%s\n' "$name" "$id" "${hash:-unknown}"
done
