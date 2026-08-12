#!/usr/bin/env bash
set -euo pipefail

# Commits canister_ids.json if a deploy changed it (new canister created).
# Plain git, so it works the same whether it's run by GitHub Actions,
# GitLab CI, a bare cron job, or a human — nothing here is host-specific.
# See docs/DEPLOYMENT.md's "Deploying without GitHub" section.
#
# Usage: scripts/commit-canister-ids.sh <branch> [--warn-only]
#   <branch>     branch to push the commit to (e.g. main)
#   --warn-only  print a diff and exit non-zero instead of committing/pushing
#                (used for production: auto-pushing to main from a tag
#                build is riskier than it's worth for a file that should
#                only ever change on first deploy of a new canister)

BRANCH="${1:?usage: scripts/commit-canister-ids.sh <branch> [--warn-only]}"
WARN_ONLY="${2:-}"

if git diff --quiet -- canister_ids.json; then
  echo "canister_ids.json unchanged."
  exit 0
fi

if [ "$WARN_ONLY" = "--warn-only" ]; then
  echo "!! canister_ids.json changed during this deploy — commit the updated file yourself:" >&2
  git diff -- canister_ids.json
  exit 1
fi

git config user.name "${GIT_AUTHOR_NAME:-deploy-bot}"
git config user.email "${GIT_AUTHOR_EMAIL:-deploy-bot@localhost}"
git add canister_ids.json
git commit -m "chore: update canister_ids.json [skip ci]"
git push origin "HEAD:$BRANCH"
