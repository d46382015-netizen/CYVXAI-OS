#!/bin/bash
# CYVX — © 2026 Dakota Lee Jonsgaard
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required"
  exit 1
fi

if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
echo "CYVX installed. Start with: bash ./start.sh"

