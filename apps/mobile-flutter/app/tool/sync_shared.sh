#!/usr/bin/env bash
# Mirror a shared/ data dir (the single source of truth) into the app's asset
# bundle. Committed + stale-checked (mise run gate) rather than symlinked, so a
# clean checkout has them.
# Usage: sync_shared.sh <shared-subdir> <assets-subdir> [--check]
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: $0 <shared-subdir> <assets-subdir> [--check]" >&2; exit 2; }
src_name="$1"
dest_name="$2"
mode="${3:-}"

app="$(cd "$(dirname "$0")/.." && pwd)"
root="$app"
while [ ! -d "$root/shared/$src_name" ] && [ "$root" != / ]; do root="$(dirname "$root")"; done
[ -d "$root/shared/$src_name" ] || { echo "shared/$src_name not found" >&2; exit 1; }

dest="$app/assets/$dest_name"
mkdir -p "$dest"
rm -f "$dest"/*.json
cp "$root/shared/$src_name"/*.json "$dest/"
echo "synced $(ls "$dest"/*.json | wc -l | tr -d ' ') file(s) -> assets/$dest_name"

# `git status --porcelain`, not `git diff`: diff is blind to untracked files, so
# a newly added locale/KAT would be copied in and the check would pass vacuously.
if [ "$mode" = "--check" ]; then
  dirty="$(git status --porcelain -- "$dest")"
  if [ -n "$dirty" ]; then
    echo "assets/$dest_name drifted from shared/$src_name - commit the mirror:" >&2
    echo "$dirty" >&2
    exit 1
  fi
fi
