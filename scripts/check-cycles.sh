#!/usr/bin/env bash
set -euo pipefail

# Reports remaining cycles for every canister in an environment. Cycles
# funding itself is a business decision (see BUSINESS.md #7) — this script
# just makes it easy to see when a canister is running low before it freezes.
#
# Usage: scripts/check-cycles.sh [environment]   (defaults to "local")

ENVIRONMENT="${1:-local}"
cd "$(dirname "$0")/.."

# `icp canister status` with no name covers every canister in the
# environment; a non-controller identity gets the public view (no balance).
icp canister status -e "$ENVIRONMENT"
