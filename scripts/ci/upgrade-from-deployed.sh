#!/usr/bin/env bash
# Checks the upgrade a deploy is about to run: from the build that is running
# on the network to this checkout.
#
# stable-compat.yml only compares a PR with its base branch, one merge at a
# time. The network can be many merges behind (a production deploy that waited
# weeks, an allow-stable-break merge in between), so before deploying, this
# runs the same stable-memory check against the last commit actually deployed:
# the newest <prefix>-YYYYMMDD-HHMMSS tag, which the deploy workflows push
# after every successful deploy.
#
# Usage: scripts/ci/upgrade-from-deployed.sh <prefix>     # staging | mainnet
#   ALLOW_STABLE_BREAK=1   report a break without failing (a planned reinstall)
# With no such tag yet (nothing deployed through the workflows), it says so
# and exits 0.
set -euo pipefail

PREFIX="${1:?usage: $0 <staging|mainnet>}"
cd "$(git rev-parse --show-toplevel)"

git fetch --quiet --depth=1 origin "refs/tags/${PREFIX}-*:refs/tags/${PREFIX}-*" 2>/dev/null || true
TAG=$(git tag -l "${PREFIX}-*" | grep -E "^${PREFIX}-[0-9]{8}-[0-9]{6}$" | sort -r | head -1 || true)
if [ -z "$TAG" ]; then
  echo "No ${PREFIX}-* tag yet: nothing deployed to compare with, skipping."
  exit 0
fi
echo "Upgrading from $TAG ($(git rev-parse --short "$TAG^{commit}")), the build running on $PREFIX"
bash scripts/ci/check-stable-compat.sh "$TAG"
