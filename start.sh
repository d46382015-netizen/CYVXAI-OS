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
  npm install
fi

if [ ! -x "./node_modules/.bin/node" ] && ! command -v node >/dev/null 2>&1; then
  echo "node is required"
  exit 1
fi

if command -v go >/dev/null 2>&1 && [ -d "./cyvx-v85" ]; then
  echo "Go control plane detected at ./cyvx-v85"
fi

mkdir -p ~/.cyvx

exec node ./api/index.js

