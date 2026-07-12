#!/usr/bin/env sh
# Generate Dart API model classes from the zod-derived OpenAPI snapshot.
#
# The snapshot (shared/contracts-openapi/openapi.snapshot.json) is emitted from the routes'
# zod schemas by the TS spec emitter, so the generated Dart models track exactly
# what the server accepts and returns - regenerate it (CONTRACT_BLESS=1 pnpm
# test:run tests/contract) whenever a schema changes, then re-run this.
#
# Requires openapi-generator-cli (https://openapi-generator.tech/) and a JDK.
# NOTE: the snapshot only covers routes converted so far; it grows as the
# response-schema fan-out completes (admin/ and leagues/ still pending).
set -eu

SPEC="../../../shared/contracts-openapi/openapi.snapshot.json"
OUT="lib/api"

command -v openapi-generator-cli >/dev/null 2>&1 || {
  echo "openapi-generator-cli not found. Install it: https://openapi-generator.tech/docs/installation" >&2
  exit 1
}

openapi-generator-cli generate \
  -i "$SPEC" \
  -g dart \
  -o "$OUT" \
  --additional-properties=pubName=nostragoalus_api,useEnumExtension=true

echo "Dart API models written to $OUT"
