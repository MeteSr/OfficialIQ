#!/usr/bin/env bash
# Fails if any canister's stable state can't be upgraded in place from BASE.
#
# Every OfficialIQ canister is a `persistent actor`, so all of its state is
# stable. Motoko refuses an upgrade whose stable variables aren't compatible
# with the running version (e.g. a new field on a record stored in a Map): the
# deploy fails with "Memory-incompatible program upgrade", and the only way
# out is a reinstall that wipes the canister's data. This catches that before
# merge (stable-compat.yml) and before a deploy (the deploy workflows run it
# against the build that is actually running — scripts/ci/upgrade-from-deployed.sh).
#
# For every backend canister it compiles BASE and HEAD with
# `moc --stable-types` and runs `moc --stable-compatible base.most head.most`.
# Canisters that don't exist at BASE are skipped.
#
# Usage: scripts/ci/check-stable-compat.sh <base-ref>
#   MOC=/path/to/moc        moc binary (default: the one bundled with dfx)
#   ALLOW_STABLE_BREAK=1    report incompatibilities without failing
set -uo pipefail

BASE_REF="${1:?usage: $0 <base-ref>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
source scripts/lib/canisters.sh   # BACKEND_CANISTERS

DFX_CACHE="$(dfx cache show 2>/dev/null || true)"
MOC="${MOC:-$DFX_CACHE/moc}"
[ -x "$MOC" ] || { echo "❌ moc not found (install dfx, or set MOC)"; exit 2; }

# The same packages dfx compiles with: mops when the project uses it,
# otherwise the core/base libraries bundled with dfx.
package_flags() {   # $1 tree
  if [ -f "$1/mops.toml" ]; then
    (cd "$1" && { [ -d .mops ] || mops install >/dev/null 2>&1 || true; } && mops sources) | tr '\n' ' '
  else
    for p in core base; do [ -d "$DFX_CACHE/$p" ] && printf -- '--package %s %s ' "$p" "$DFX_CACHE/$p"; done
  fi
}

BASE_SHA=$(git rev-parse --verify "$BASE_REF^{commit}") || { echo "❌ unknown base ref: $BASE_REF"; exit 2; }
WORK=$(mktemp -d)
BASE_TREE="$WORK/base"
trap 'git worktree remove --force "$BASE_TREE" >/dev/null 2>&1; rm -rf "$WORK"' EXIT
git worktree add --detach --quiet "$BASE_TREE" "$BASE_SHA"
HEAD_PKGS=$(package_flags "$REPO_ROOT")
BASE_PKGS=$(package_flags "$BASE_TREE")

# Canisters that import another canister by ID (ai_proxy imports the
# management canister, "ic:aaaaa-aa") need its Candid file, which dfx writes
# to .dfx/local/canisters/idl/ when it builds them. No replica is needed.
IDL_DIR="$REPO_ROOT/.dfx/local/canisters/idl"
for name in "${BACKEND_CANISTERS[@]}"; do
  if grep -qE '^import .*"ic:' "backend/$name/main.mo" 2>/dev/null; then
    dfx build --check "$name" >/dev/null 2>&1 || true
  fi
done
mkdir -p "$IDL_DIR"

stable_types() {   # $1 tree, $2 main.mo (relative), $3 package flags, $4 out prefix
  # shellcheck disable=SC2086
  (cd "$1" && "$MOC" --stable-types --actor-idl "$IDL_DIR" $3 "$2" -o "$4.wasm" 2>&1 >/dev/null) || return 1
  [ -f "$4.most" ]
}

echo "Stable-memory compatibility: $(git rev-parse --short "$BASE_SHA") → $(git rev-parse --short HEAD)"
BROKEN=(); ERRORED=()
SUMMARY="| Canister | Result |\n|---|---|\n"

for name in "${BACKEND_CANISTERS[@]}"; do
  main="backend/$name/main.mo"
  if [ ! -f "$BASE_TREE/$main" ]; then
    printf '  %-12s new canister — skipped\n' "$name"
    SUMMARY+="| $name | new — skipped |\n"; continue
  fi
  if ! stable_types "$BASE_TREE" "$main" "$BASE_PKGS" "$WORK/$name.base" >/dev/null; then
    printf '  %-12s ⚠ base does not compile — skipped\n' "$name"
    SUMMARY+="| $name | base doesn't compile — skipped |\n"; continue
  fi
  if ! err=$(stable_types "$REPO_ROOT" "$main" "$HEAD_PKGS" "$WORK/$name.head"); then
    printf '  %-12s ❌ head does not compile\n%s\n' "$name" "$err"
    ERRORED+=("$name"); SUMMARY+="| $name | ❌ head doesn't compile |\n"; continue
  fi
  if out=$("$MOC" --stable-compatible "$WORK/$name.base.most" "$WORK/$name.head.most" 2>&1); then
    printf '  %-12s ✓\n' "$name"
    SUMMARY+="| $name | ✓ compatible |\n"
  else
    printf '  %-12s ❌ incompatible\n%s\n' "$name" "$(echo "$out" | sed 's/^/      /')"
    BROKEN+=("$name"); SUMMARY+="| $name | ❌ **incompatible** |\n"
  fi
done

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { echo "### Stable-memory compatibility ($(git rev-parse --short "$BASE_SHA") → $(git rev-parse --short HEAD))"; echo; echo -e "$SUMMARY"; } >> "$GITHUB_STEP_SUMMARY"
fi

if [ ${#ERRORED[@]} -gt 0 ]; then
  echo "❌ Could not compile: ${ERRORED[*]}"; exit 1
fi
if [ ${#BROKEN[@]} -gt 0 ]; then
  cat <<MSG

❌ Upgrading ${BROKEN[*]} would trap with "Memory-incompatible program upgrade",
   and recovering means reinstalling — deleting that canister's data.

   Keep stable state compatible instead:
   - store new data in a new stable Map/var rather than adding a field to a
     record, or a tag to a variant, that is already stored (even an optional
     field breaks records held in a Map), or
   - convert the existing data with a migration function:
     (with migration = ...) persistent actor { ... }
     https://internetcomputer.org/docs/motoko/fundamentals/actors/compatibility

   If a reinstall is genuinely intended, add the 'allow-stable-break' label to
   the PR and say in the description which data will be lost.
MSG
  if [ "${ALLOW_STABLE_BREAK:-}" = "1" ]; then
    echo "⚠ ALLOW_STABLE_BREAK is set — reporting without failing."; exit 0
  fi
  exit 1
fi
echo "✅ All canisters can be upgraded in place."
