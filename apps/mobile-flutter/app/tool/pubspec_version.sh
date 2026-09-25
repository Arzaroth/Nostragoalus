#!/usr/bin/env bash
# Print the app's own `name code` from its pubspec `version: name+code` - NOT the
# website's version: the two ship on separate lines.
# sed exits 0 on no match, so an unparsed line would otherwise ship as an empty
# name and build number 0, which no already-installed build can upgrade from.
# Usage: pubspec_version.sh <task> <pubspec.yaml>
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 <task> <pubspec.yaml>" >&2; exit 2; }
task="$1"
version=$(sed -n 's/^version: *\([0-9.]*\)+.*/\1/p' "$2" | head -1)
code=$(sed -n 's/^version: *[0-9.]*+\([0-9]*\).*/\1/p' "$2" | head -1)
case "$version" in
  ''|*[!0-9.]*|*..*|.*|*.) echo "$task: pubspec version '$version' is not a plain x.y.z" >&2; exit 1 ;;
esac
case "$code" in
  ''|*[!0-9]*) echo "$task: pubspec build number '$code' is not an integer" >&2; exit 1 ;;
esac
echo "$version $code"
