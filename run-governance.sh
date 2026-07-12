#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
export CYVX_ALLOW_INSECURE_LOCAL="${CYVX_ALLOW_INSECURE_LOCAL:-true}"
export CYVX_GOVERNANCE_HOST="${CYVX_GOVERNANCE_HOST:-127.0.0.1}"
export CYVX_GOVERNANCE_PORT="${CYVX_GOVERNANCE_PORT:-8790}"
exec node ./api/governance-public.js
