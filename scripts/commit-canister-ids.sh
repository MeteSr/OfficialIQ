#!/usr/bin/env bash
set -euo pipefail

# Commits icp-cli's mainnet canister-ID mappings (.icp/data/mappings/) to
# <branch> if a deploy changed them (a new canister was created). These files
# are the only record of which on-chain canister is which, so they must be
# committed (icp-cli skill). Plain git, so it works the same whether it's run
# by GitHub Actions, GitLab CI, a bare cron job, or a human.
#
# Run it even when the deploy failed partway: canister creation is real and
# paid for the moment it happens, and an ID that isn't committed means the
# next deploy can't see that canister and creates (and pays for) another one.
#
# The deploy may have run on an older commit than <branch>'s tip (main moved
# while it ran), so this commits on top of the current tip in a separate
# worktree, merging in only the IDs this deploy recorded — never reverting
# anything else, and leaving the job's own checkout alone.
#
# Usage: scripts/commit-canister-ids.sh <branch> [--warn-only]
#   <branch>     branch to push the commit to (e.g. main)
#   --warn-only  print the change and exit non-zero instead of committing
#
# Environment:
#   PUSH_TOKEN + GITHUB_REPOSITORY — push over HTTPS with this token (CI
#                checkouts keep no credentials in .git/config). Unset, it
#                pushes to `origin` with whatever credentials git has.

BRANCH="${1:?usage: scripts/commit-canister-ids.sh <branch> [--warn-only]}"
WARN_ONLY="${2:-}"
MAPPINGS=".icp/data/mappings"

if [ -z "$(git status --porcelain -- "$MAPPINGS" 2>/dev/null)" ]; then
  echo "$MAPPINGS unchanged."
  exit 0
fi

if [ "$WARN_ONLY" = "--warn-only" ]; then
  echo "!! $MAPPINGS changed during this deploy — commit the updated files yourself:" >&2
  git status --porcelain -- "$MAPPINGS"
  git --no-pager diff -- "$MAPPINGS"
  exit 1
fi

REMOTE=origin
if [ -n "${PUSH_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  REMOTE="https://x-access-token:${PUSH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
fi

SRC="$PWD/$MAPPINGS"
WT=$(mktemp -d)
trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"' EXIT
git fetch --quiet --depth=1 "$REMOTE" "$BRANCH"
git worktree add --quiet --detach "$WT" FETCH_HEAD

# Overlay this deploy's IDs onto the branch's files, canister by canister.
python3 - "$SRC" "$WT/$MAPPINGS" <<'PY'
import json, os, sys
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for name in sorted(os.listdir(src)):
    if not name.endswith(".ids.json"):
        continue
    deployed = json.load(open(os.path.join(src, name)))
    target = os.path.join(dst, name)
    merged = json.load(open(target)) if os.path.exists(target) else {}
    merged.update(deployed)
    with open(target, "w") as f:
        json.dump(merged, f, indent=2, sort_keys=True)
        f.write("\n")
PY

cd "$WT"
git add "$MAPPINGS"
if git diff --cached --quiet; then
  echo "$MAPPINGS already up to date on $BRANCH."
  exit 0
fi
git -c user.name="${GIT_AUTHOR_NAME:-deploy-bot}" -c user.email="${GIT_AUTHOR_EMAIL:-deploy-bot@localhost}" \
  commit --quiet -m "chore: update canister ID mappings [skip ci]"
if ! git -c core.hooksPath=/dev/null push --quiet "$REMOTE" "HEAD:refs/heads/$BRANCH"; then
  echo "::error::Could not push $MAPPINGS to $BRANCH — commit these by hand before the next deploy:" >&2
  git --no-pager show --stat HEAD >&2
  cat "$MAPPINGS"/*.ids.json >&2
  exit 1
fi
echo "Committed $MAPPINGS to $BRANCH."
