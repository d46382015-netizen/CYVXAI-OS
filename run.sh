#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

export NODE_ENV="${NODE_ENV:-development}"
export CYVX_DATA_ROOT="${CYVX_DATA_ROOT:-$REPO_ROOT/.cyvx}"
export CYVX_PUBLIC_PORT="${CYVX_PUBLIC_PORT:-3000}"
export CYVX_WORKER_ID="${CYVX_WORKER_ID:-worker-main}"

mkdir -p "$CYVX_DATA_ROOT/logs" "$CYVX_DATA_ROOT/backups" "$CYVX_DATA_ROOT/evidence"
command -v node >/dev/null 2>&1 || { echo "Node.js 22+ is required" >&2; exit 69; }
node -e 'const major=Number(process.versions.node.split(".")[0]);if(major<22){console.error("Node.js 22+ is required");process.exit(1)}'

if [[ "$NODE_ENV" == "production" ]]; then
  AUTH_SECRET="${CYVX_AUTH_SECRET:-}"
  [[ ${#AUTH_SECRET} -ge 32 ]] || { echo "CYVX_AUTH_SECRET must contain at least 32 characters in production" >&2; exit 78; }
  [[ -n "${CYVX_CORS_ALLOWLIST:-}" ]] || { echo "CYVX_CORS_ALLOWLIST is required in production" >&2; exit 78; }
  export CYVX_ALLOW_INSECURE_LOCAL=false
else
  export CYVX_ALLOW_INSECURE_LOCAL="${CYVX_ALLOW_INSECURE_LOCAL:-true}"
fi

if [[ ! -d node_modules ]]; then
  if [[ -f package-lock.json ]]; then npm ci --omit=optional; else npm install --omit=optional; fi
fi

node -e "const {createMissionRuntime}=require('./runtime/missions');const r=createMissionRuntime({dataRoot:process.env.CYVX_DATA_ROOT});console.log(JSON.stringify({event:'cyvx.migrations.ready',schema_version:2,database:r.dbPath}));r.close();"

API_PID=""; WORKER_PID=""
shutdown() {
  local code="${1:-0}"
  trap - INT TERM EXIT
  [[ -n "$API_PID" ]] && kill -TERM "$API_PID" 2>/dev/null || true
  [[ -n "$WORKER_PID" ]] && kill -TERM "$WORKER_PID" 2>/dev/null || true
  [[ -n "$API_PID" ]] && wait "$API_PID" 2>/dev/null || true
  [[ -n "$WORKER_PID" ]] && wait "$WORKER_PID" 2>/dev/null || true
  exit "$code"
}
trap 'shutdown 130' INT
trap 'shutdown 143' TERM
trap 'shutdown $?' EXIT

node runtime/missions/worker.js &
WORKER_PID=$!
node api/public.js &
API_PID=$!

echo "CYVXAI-OS public gateway: http://127.0.0.1:$CYVX_PUBLIC_PORT"
echo "Mission operator: http://127.0.0.1:$CYVX_PUBLIC_PORT/missions"
echo "API PID: $API_PID | Worker PID: $WORKER_PID"

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WORKER_PID" 2>/dev/null; do sleep 1; done
if ! kill -0 "$API_PID" 2>/dev/null; then wait "$API_PID" || status=$?; else wait "$WORKER_PID" || status=$?; fi
shutdown "${status:-1}"
