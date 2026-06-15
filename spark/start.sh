#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."

command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js is required." >&2; exit 1; }
mkdir -p .cyvx/logs .cyvx/worlds

export SPARK_HOST="${SPARK_HOST:-127.0.0.1}"
export SPARK_PORT="${SPARK_PORT:-3100}"

echo "Spark + CYVX starting at http://${SPARK_HOST}:${SPARK_PORT}"
exec node ./spark/server.js
