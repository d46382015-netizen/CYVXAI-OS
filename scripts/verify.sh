#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

command -v node >/dev/null 2>&1 || { echo "Node.js 22+ is required" >&2; exit 69; }
mkdir -p artifacts/verification-logs docs
exec node scripts/verify-runtime.js
