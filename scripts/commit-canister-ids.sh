#!/usr/bin/env bash
set -euo pipefail

# Commits icp-cli's mainnet canister-ID mapping if a deploy changed it (a new
# canister was created). These files are the only record of which on-chain
# canister is which, so they must be committed (icp-cli skill).
# Plain git, so it works the same whether it's run by GitHub Actions,
# GitLab CI, a bare cron job, or a human — nothing here is host-specific.
#
# Usage: scripts/commit-canister-ids.sh <branch> [--warn-only]
#   <branch>     branch to push the commit to (e.g. main)
#   --warn-only  print a diff and exit non-zero instead of committing/pushing
#                (used for production: auto-pushing to main from a tag
#                build is riskier than it's worth for a file that should
#                only ever change on first deploy of a new canister)

BRANCH="${1:?usage: scripts/commit-canister-ids.sh <branch> [--warn-only]}"
WARN_ONLY="${2:-}"
MAPPINGS=".icp/data/mappings"

if [ -z "$(git status --porcelain -- "$MAPPINGS")" ]; then
  echo "$MAPPINGS unchanged."
  exit 0
fi

if [ "$WARN_ONLY" = "--warn-only" ]; then
  echo "!! $MAPPINGS changed during this deploy — commit the updated files yourself:" >&2
  git status --porcelain -- "$MAPPINGS"
  git diff -- "$MAPPINGS"
  exit 1
fi

git config user.name "${GIT_AUTHOR_NAME:-deploy-bot}"
git config user.email "${GIT_AUTHOR_EMAIL:-deploy-bot@localhost}"
git add "$MAPPINGS"
git commit -m "chore: update canister ID mappings [skip ci]"
git push origin "HEAD:$BRANCH"
