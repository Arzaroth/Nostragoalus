#!/usr/bin/env bash
# Copy the shared locale JSON (the single source of truth, shared/i18n-json) into
# the app's asset bundle. Committed + stale-checked (mise run i18n-check) rather
# than symlinked, so a clean checkout and CI both have them.
set -euo pipefail
app="$(cd "$(dirname "$0")/.." && pwd)"
root="$app"
while [ ! -d "$root/shared/i18n-json" ] && [ "$root" != / ]; do root="$(dirname "$root")"; done
[ -d "$root/shared/i18n-json" ] || { echo "shared/i18n-json not found" >&2; exit 1; }

dest="$app/assets/i18n"
mkdir -p "$dest"
rm -f "$dest"/*.json
cp "$root"/shared/i18n-json/*.json "$dest/"
echo "synced $(ls "$dest"/*.json | wc -l | tr -d ' ') locales -> assets/i18n"
