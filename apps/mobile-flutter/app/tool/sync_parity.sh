#!/usr/bin/env bash
# Mirror the frozen cross-stack KATs (shared/parity-json) into the app bundle so
# the on-device interop test can replay them. Committed + stale-checkable, like
# the locale mirror.
set -euo pipefail
app="$(cd "$(dirname "$0")/.." && pwd)"
root="$app"
while [ ! -d "$root/shared/parity-json" ] && [ "$root" != / ]; do root="$(dirname "$root")"; done
[ -d "$root/shared/parity-json" ] || { echo "shared/parity-json not found" >&2; exit 1; }

dest="$app/assets/parity"
mkdir -p "$dest"
cp "$root"/shared/parity-json/e2ee.json "$dest/"
echo "synced e2ee KATs -> assets/parity"
