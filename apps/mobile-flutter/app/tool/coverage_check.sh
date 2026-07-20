#!/usr/bin/env bash
# Line-coverage floor over the LOGIC layers of lib/, read from the lcov that
# `flutter test --coverage` writes. Mirrors how the web gate scopes its 98%:
# services and pure logic are gated, pages/components are not.
#
# Excluded (and why):
#   lib/api/models.gen.dart  generated from the OpenAPI snapshot; the gate's
#                            stale-check is what proves it, not a test
#   lib/ui/**                screens and widgets - the mobile analogue of
#                            apps/web-nuxt/app/pages, which the web gate also
#                            leaves out of its coverage scope
#   lib/main.dart            the entrypoint: runApp + platform bootstrap
set -euo pipefail
cd "$(dirname "$0")/.."

# 60, measured at ~63.5% the day the floor went in. Ratchet it up as the suite
# grows; never lower it to make a red gate green.
MIN="${1:-${COVERAGE_MIN:-60}}"
LCOV=coverage/lcov.info

if [ ! -f "$LCOV" ]; then
  echo "coverage_check: $LCOV missing - run 'flutter test --coverage' first" >&2
  exit 1
fi

awk -v min="$MIN" '
  /^SF:/ {
    f = substr($0, 4)
    skip = (f ~ /lib\/api\/models\.gen\.dart$/ || f ~ /lib\/ui\// || f ~ /lib\/main\.dart$/)
    next
  }
  skip { next }
  /^LF:/ { lf += substr($0, 4) }
  /^LH:/ { lh += substr($0, 4) }
  END {
    if (lf == 0) { print "coverage_check: no gated lines found in the lcov"; exit 1 }
    pct = 100 * lh / lf
    printf "coverage: %.2f%% of gated lib/ lines (%d/%d), floor %s%%\n", pct, lh, lf, min
    if (pct + 0.005 < min) { print "coverage_check: BELOW the floor"; exit 1 }
  }
' "$LCOV"
