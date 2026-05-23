#!/bin/bash
# CYVX — © 2026 Dakota Lee Jonsgaard
# One command starts the entire system
set -euo pipefail

cd "$(dirname "$0")"

echo "╔══════════════════════════════════════════════════╗"
echo "║  CYVX — Autonomous Infrastructure Intelligence  ║"
echo "║  © 2026 Dakota Lee Jonsgaard                    ║"
echo "║  Production control plane bootstrap              ║"
echo "╚══════════════════════════════════════════════════╝"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies"
  npm install
fi

mkdir -p ~/.cyvx

export CYVX_HOST="${CYVX_HOST:-0.0.0.0}"
export CYVX_PORT="${CYVX_PORT:-3000}"

PUBLIC_HOST="${CYVX_PUBLIC_HOST:-127.0.0.1}"

printf 'Bind address: http://%s:%s\n' "$CYVX_HOST" "$CYVX_PORT"
printf 'Public URL:   http://%s:%s\n' "$PUBLIC_HOST" "$CYVX_PORT"
printf 'Health check: http://%s:%s/healthz\n' "$PUBLIC_HOST" "$CYVX_PORT"

if command -v go >/dev/null 2>&1 && [ -d "./cyvx-v85" ]; then
  echo "Go control plane detected at ./cyvx-v85"
fi

exec node ./api/index.js
