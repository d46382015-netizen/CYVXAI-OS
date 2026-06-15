#!/bin/bash
# CYVX — © 2026 Dakota Lee Jonsgaard
# One command starts the entire system
set -euo pipefail

echo "╔══════════════════════════════════════════════════╗"
echo "║  CYVX — Autonomous Infrastructure Intelligence  ║"
echo "║  © 2026 Dakota Lee Jonsgaard                    ║"
echo "║  The Global Nervous System for Compute          ║"
echo "╚══════════════════════════════════════════════════╝"

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required"
  exit 1
fi

# Clear stale CYVX listeners so the fresh launch always serves this worktree.
pkill -f "node .*api/index.js" >/dev/null 2>&1 || true
pkill -f "node .*api/production.js" >/dev/null 2>&1 || true

if command -v go >/dev/null 2>&1 && [ -d "./cyvx-v85" ]; then
  echo "Go control plane detected at ./cyvx-v85"
fi

mkdir -p ~/.cyvx

export CYVX_HOST="${CYVX_HOST:-0.0.0.0}"
export CYVX_PORT="${CYVX_PORT:-${PORT:-3000}}"
export CYVX_INTERNAL_PORT="${CYVX_INTERNAL_PORT:-$((CYVX_PORT + 1))}"

echo "Starting CYVX production gateway on http://${CYVX_HOST}:${CYVX_PORT}"
exec node ./api/production.js
