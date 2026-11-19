#!/usr/bin/env bash
set -uo pipefail

# Weekly "are we still on the latest ICP stack?" check, run by
# .github/workflows/icp-freshness.yml (and fine to run by hand). Covers what
# Dependabot can't see:
#
#   1. Motoko compiler pin (mops.toml [toolchain] moc) vs the latest moc release
#   2. Motoko packages (mops.toml [dependencies]) via `mops outdated`
#   3. icp-cli recipe pins in icp.yaml vs the latest dfinity/icp-cli-recipes tags,
#      and the local network launcher pin vs the latest launcher release
#   4. DFINITY's published ICP skills (skills.internetcomputer.org) vs the
#      hashes recorded in .github/icp-skills.json at the last review
#
# npm packages (frontend SDK, tools/ toolchain) and GitHub Actions are left
# to Dependabot (.github/dependabot.yml).
#
# Writes a markdown report to $REPORT (default: stdout) and, when the skills
# index changed, rewrites .github/icp-skills.json so a PR can record the review.
# Exit codes: 0 = everything current, 10 = updates available, 2 = a check
# couldn't run (and nothing found outdated).

cd "$(dirname "$0")/.."
REPORT="${REPORT:-/dev/stdout}"
SKILLS_LOCK=".github/icp-skills.json"
SKILLS_INDEX_URL="${SKILLS_INDEX_URL:-https://skills.internetcomputer.org/.well-known/skills/index.json}"
SKILLS_CHANGED_FILE="${SKILLS_CHANGED_FILE:-}"   # set by CI: gets "true" when the lock was rewritten
outdated=0
failed=0

: > "$REPORT.tmp"
say() { printf '%s\n' "$*" >> "$REPORT.tmp"; }

latest_tag() {  # latest_tag <repo> <prefix> → highest X.Y.Z tag after the prefix
  git ls-remote --tags --refs "https://github.com/$1" 2>/dev/null \
    | sed -n "s#.*refs/tags/$2\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)\$#\1#p" \
    | sort -V | tail -1
}

say "## ICP freshness report"
say ""

# 1. moc
pinned_moc=$(sed -n 's/^moc *= *"\(.*\)"/\1/p' mops.toml | head -1)
latest_moc=$(latest_tag caffeinelabs/motoko "")
say "### Motoko compiler"
if [[ -z "$latest_moc" ]]; then
  say "- ⚠️ Couldn't read moc releases from GitHub."; failed=1
elif [[ "$pinned_moc" != "$latest_moc" ]]; then
  say "- moc **$pinned_moc → $latest_moc** available. Bump with \`mops toolchain update moc\` (check the \`migrating-to-moc-2\` skill for a major bump)."
  outdated=1
else
  say "- moc $pinned_moc is current."
fi
say ""

# 2. mops packages
say "### Motoko packages"
if command -v mops >/dev/null 2>&1; then
  mops_out=$(mops outdated 2>&1); mops_rc=$?
  if [[ $mops_rc -eq 0 ]]; then
    say "- All mops dependencies are current."
  elif [[ $mops_rc -eq 1 ]]; then
    say "- Updates available (\`mops update\`, or \`mops update --major\` for majors):"
    say '```'; say "$mops_out"; say '```'
    outdated=1
  else
    say "- ⚠️ \`mops outdated\` failed:"; say '```'; say "$mops_out"; say '```'; failed=1
  fi
else
  say "- ⚠️ mops not installed — run scripts/install-icp.sh."; failed=1
fi
say ""

# 3. icp-cli recipes
say "### icp-cli recipes (icp.yaml)"
recipe_pins=$(grep -o '@dfinity/[a-z-]*@v[0-9.]*' icp.yaml | sort -u)
for pin in $recipe_pins; do
  name=${pin#@dfinity/}; name=${name%@*}; ver=${pin##*@v}
  latest=$(latest_tag dfinity/icp-cli-recipes "$name-v")
  if [[ -z "$latest" ]]; then
    say "- ⚠️ Couldn't read releases for \`$name\`."; failed=1
  elif [[ "$ver" != "$latest" ]]; then
    note=""
    [[ "$name" == "static-site" ]] && note=" A major (or pre-1.0 minor) bump needs \`icp canister install frontend --mode reinstall\` before \`icp deploy\` — see docs/DEPLOYMENT.md."
    say "- \`@dfinity/$name\` **v$ver → v$latest** available.$note"
    outdated=1
  else
    say "- \`@dfinity/$name\` v$ver is current."
  fi
done
say ""

say "### Local network launcher (icp.yaml)"
pinned_launcher=$(sed -n 's/^ *version: *\(v[0-9][^ ]*\).*/\1/p' icp.yaml | head -1)
latest_launcher=$(git ls-remote --tags --refs https://github.com/dfinity/icp-cli-network-launcher 2>/dev/null \
  | sed -n 's#.*refs/tags/\(v[0-9][0-9.]*-[0-9-]*\)$#\1#p' | sort -V | tail -1)
if [[ -z "$pinned_launcher" ]]; then
  say "- ⚠️ No launcher \`version\` pinned on the local network in icp.yaml."; failed=1
elif [[ -z "$latest_launcher" ]]; then
  say "- ⚠️ Couldn't read icp-cli-network-launcher releases."; failed=1
elif [[ "$pinned_launcher" != "$latest_launcher" ]]; then
  say "- Launcher **$pinned_launcher → $latest_launcher** available. Update \`version\` under the local network in icp.yaml."
  outdated=1
else
  say "- Launcher $pinned_launcher is current."
fi
say ""

# 4. ICP skills
say "### ICP skills (skills.internetcomputer.org)"
index=$(mktemp); trap 'rm -f "$index" "$REPORT.tmp"' EXIT
if ! curl -fsSL --max-time 30 "$SKILLS_INDEX_URL" -o "$index" || ! jq -e '.skills' "$index" >/dev/null 2>&1; then
  say "- ⚠️ Couldn't fetch the skills index."; failed=1
else
  current=$(jq -S '[.skills[] | {key: .name, value: (.hash // "")}] | from_entries' "$index")
  if [[ ! -f "$SKILLS_LOCK" ]]; then
    printf '%s\n' "$current" > "$SKILLS_LOCK"
    say "- Recorded a baseline of $(jq 'length' <<<"$current") skills in \`$SKILLS_LOCK\`."
    [[ -n "$SKILLS_CHANGED_FILE" ]] && echo true > "$SKILLS_CHANGED_FILE"
  else
    previous=$(cat "$SKILLS_LOCK")
    changes=$(jq -rn --argjson old "$previous" --argjson new "$current" '
      ([$new | keys[] | select(($old[.] // null) == null) | "- added: `\(.)`"] +
       [$new | keys[] | select($old[.] != null and $old[.] != $new[.]) | "- updated: `\(.)`"] +
       [$old | keys[] | select(($new[.] // null) == null) | "- removed: `\(.)`"]) | .[]')
    if [[ -n "$changes" ]]; then
      say "Changed since the last review — re-check the app against these:"
      say "$changes"
      say ""
      say "Skill pages: https://skills.internetcomputer.org/skills/<name>/"
      printf '%s\n' "$current" > "$SKILLS_LOCK"
      [[ -n "$SKILLS_CHANGED_FILE" ]] && echo true > "$SKILLS_CHANGED_FILE"
      outdated=1
    else
      say "- No skill changed since the last review."
    fi
  fi
fi

cat "$REPORT.tmp" > "$REPORT"
[[ $outdated -eq 1 ]] && exit 10
[[ $failed -eq 1 ]] && exit 2
exit 0
