#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command_name="${1:-start}"

case "$command_name" in
  build)
    node ./scripts/build-field-manual.js
    ;;
  verify)
    node --check ./apps/field-manual/server.js
    node --check ./apps/field-manual/lib/catalog.js
    node --check ./apps/field-manual/lib/store.js
    node --check ./apps/field-manual/lib/renderer.js
    node --check ./apps/field-manual/lib/pipeline.js
    node --test ./test/field-manual.test.js
    node ./scripts/build-field-manual.js
    ;;
  start)
    "$0" verify
    exec node ./scripts/start-field-manual.js
    ;;
  *)
    printf 'Usage: %s [start|build|verify]\n' "$0" >&2
    exit 64
    ;;
esac
