#!/usr/bin/env bash
# Regenerate lib/api/models.gen.dart from the committed OpenAPI snapshot.
# Pure Dart (no Flutter), so it runs in CI without a device/emulator.
set -euo pipefail
cd "$(dirname "$0")/.."
dart run tool/gen_models.dart
dart format lib/api/models.gen.dart >/dev/null
echo "ok: lib/api/models.gen.dart regenerated + formatted"
