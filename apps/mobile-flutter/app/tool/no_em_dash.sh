#!/usr/bin/env bash
# The repo forbids the em-dash character. The rule is repo-wide, so the scan is
# too: the shared locale SOURCES (which the app mirrors into assets/i18n), all of
# apps/mobile-flutter, and the web app's own source. Tracked files plus
# untracked-not-ignored ones, so a brand-new file cannot sneak one in; build
# output, node_modules and .dart_tool are gitignored and never scanned.
# CLAUDE.md is excluded: it quotes the character in order to forbid it.
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

# Built from its escape so this script is not its own first offender.
emdash=$(printf '\u2014')

scan=(
  shared
  apps/mobile-flutter
  apps/web-nuxt/app
  apps/web-nuxt/server
  apps/web-nuxt/shared
  apps/web-nuxt/lib
  apps/web-nuxt/tests
  brain
  ROADMAP.md
  TODO.md
  README.md
  CHANGELOG.md
  # The about page renders these, so an em-dash reaches users the same way one
  # in CHANGELOG.md does.
  i18n/changelogs
)

hits=$(git ls-files -z --cached --others --exclude-standard "${scan[@]}" |
  xargs -0 grep -I -n "$emdash" || true)

if [ -n "$hits" ]; then
  echo "em-dash found - replace with ' - ' or rephrase:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "no em-dash in the scanned tree"
