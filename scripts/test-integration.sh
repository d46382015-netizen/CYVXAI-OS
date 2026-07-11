#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export NODE_ENV=test
export CYVX_ENV=test
export CYVX_ALLOW_INSECURE_LOCAL=true
export CYVX_AUTH_SECRET="${CYVX_AUTH_SECRET:-integration-runtime-secret-longer-than-thirty-two-characters}"

node --test \
  test/mission-runtime.test.js \
  test/mission-public-gateway.test.js
