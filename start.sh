#!/bin/bash
# CYVX — © 2026 Dakota Lee Jonsgaard
# One command starts the public Spark product and CYVX operating system.
set -euo pipefail

echo "╔══════════════════════════════════════════════════╗"
echo "║  Spark + CYVX — Public Reality Infrastructure   ║"
echo "║  © 2026 Dakota Lee Jonsgaard                    ║"
echo "║  Intention → World → Proof → Outcome             ║"
echo "╚══════════════════════════════════════════════════╝"

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required"
  exit 1
fi

if [ ! -d node_modules ]; then
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
fi

# Clear stale local listeners so the fresh launch always serves this worktree.
pkill -f "node .*api/index.js" >/dev/null 2>&1 || true
pkill -f "node .*api/production.js" >/dev/null 2>&1 || true
pkill -f "node .*api/public.js" >/dev/null 2>&1 || true
pkill -f "node .*spark/server.js" >/dev/null 2>&1 || true

PUBLIC_PORT="${PORT:-${CYVX_PUBLIC_PORT:-3000}}"
export PORT="$PUBLIC_PORT"
export CYVX_PUBLIC_HOST="${CYVX_PUBLIC_HOST:-0.0.0.0}"
export CYVX_GATEWAY_INTERNAL_PORT="${CYVX_GATEWAY_INTERNAL_PORT:-$((PUBLIC_PORT + 1))}"
export CYVX_INTERNAL_PORT="${CYVX_INTERNAL_PORT:-$((PUBLIC_PORT + 2))}"
export CYVX_SPARK_INTERNAL_PORT="${CYVX_SPARK_INTERNAL_PORT:-$((PUBLIC_PORT + 3))}"
export CYVX_DATA_ROOT="${CYVX_DATA_ROOT:-${RENDER_DISK_PATH:-$HOME/.cyvx}}"
export SPARK_STATE_FILE="${SPARK_STATE_FILE:-$CYVX_DATA_ROOT/spark-state.json}"
export SPARK_ARTIFACT_ROOT="${SPARK_ARTIFACT_ROOT:-$CYVX_DATA_ROOT/worlds}"
export SPARK_LOG="${SPARK_LOG:-$CYVX_DATA_ROOT/logs/spark-runtime.log}"
export CYVX_PLATFORM_STATE="${CYVX_PLATFORM_STATE:-$CYVX_DATA_ROOT/platform-state.json}"
export CYVX_GITHUB_WEBHOOK_STORE="${CYVX_GITHUB_WEBHOOK_STORE:-$CYVX_DATA_ROOT/github-webhooks.json}"
export CYVX_GITHUB_AUTH_STORE="${CYVX_GITHUB_AUTH_STORE:-$CYVX_DATA_ROOT/github-auth.json}"

mkdir -p "$CYVX_DATA_ROOT" "$SPARK_ARTIFACT_ROOT" "$(dirname "$SPARK_LOG")"

echo "Public Spark: http://${CYVX_PUBLIC_HOST}:${PUBLIC_PORT}/"
echo "CYVX OS:      http://${CYVX_PUBLIC_HOST}:${PUBLIC_PORT}/os"
echo "Health:       http://${CYVX_PUBLIC_HOST}:${PUBLIC_PORT}/healthz"

exec node ./api/public.js
