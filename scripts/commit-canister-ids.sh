#!/usr/bin/env bash
set -euo pipefail

# Commits canister_ids.json to <branch> if a deploy changed it (a new canister
# was created). Plain git, so it works the same whether it's run by GitHub
# Actions, GitLab CI, a bare cron job, or a human — see docs/DEPLOYMENT.md's
# "Deploying without GitHub" section.
#
# Run it even when the deploy failed partway: canister creation is real and
# paid for the moment it happens, and an ID that isn't committed means the
# next deploy can't see that canister and creates (and pays for) another one.
#
# The deploy may have run on an older commit than <branch>'s tip (main moved
# while it ran), so this commits on top of the current tip, merging in only
# the IDs this deploy recorded — never reverting anything else.
#
# Usage: scripts/commit-canister-ids.sh <branch> [--warn-only]
#   <branch>     branch to push the commit to (e.g. main)
#   --warn-only  print the diff and exit non-zero instead of committing
#
# Environment:
#   PUSH_TOKEN + GITHUB_REPOSITORY — push over HTTPS with this token (CI
#                checkouts keep no credentials in .git/config). Unset, it
#                pushes to `origin` with whatever credentials git has.

BRANCH="${1:?usage: scripts/commit-canister-ids.sh <branch> [--warn-only]}"
WARN_ONLY="${2:-}"

if [ ! -f canister_ids.json ] || { git ls-files --error-unmatch canister_ids.json >/dev/null 2>&1 && git diff --quiet -- canister_ids.json; }; then
  echo "canister_ids.json unchanged."
  exit 0
fi

if [ "$WARN_ONLY" = "--warn-only" ]; then
  echo "!! canister_ids.json changed during this deploy — commit the updated file yourself:" >&2
  git --no-pager diff -- canister_ids.json || cat canister_ids.json
  exit 1
fi

REMOTE=origin
if [ -n "${PUSH_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  REMOTE="https://x-access-token:${PUSH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
fi

# Commit in a separate worktree on the branch tip, so the rest of the job keeps
# running against the commit it deployed.
WT=$(mktemp -d)
trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"' EXIT
git fetch --quiet --depth=1 "$REMOTE" "$BRANCH"
git worktree add --quiet --detach "$WT" FETCH_HEAD

# Overlay this deploy's IDs onto the branch's file, network by network.
python3 - canister_ids.json "$WT/canister_ids.json" <<'PY'
import json, os, sys
deployed = json.load(open(sys.argv[1]))
target = sys.argv[2]
merged = json.load(open(target)) if os.path.exists(target) else {}
for canister, networks in deployed.items():
    merged.setdefault(canister, {}).update(networks)
with open(target, "w") as f:
    json.dump(merged, f, indent=2, sort_keys=True)
    f.write("\n")
PY

cd "$WT"
git add canister_ids.json
if git diff --cached --quiet; then
  echo "canister_ids.json already up to date on $BRANCH."
  exit 0
fi
git -c user.name="${GIT_AUTHOR_NAME:-deploy-bot}" -c user.email="${GIT_AUTHOR_EMAIL:-deploy-bot@localhost}" \
  commit --quiet -m "chore: update canister_ids.json [skip ci]"
if ! git -c core.hooksPath=/dev/null push --quiet "$REMOTE" "HEAD:refs/heads/$BRANCH"; then
  echo "::error::Could not push canister_ids.json to $BRANCH — commit it by hand before the next deploy:" >&2
  cat canister_ids.json >&2
  exit 1
fi
echo "Committed canister_ids.json to $BRANCH."
