#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
node --test
if curl -fsS "http://127.0.0.1:${PORT:-8789}/api/health" >/tmp/cyvx-vault-health.json 2>/dev/null; then
  node -e "const x=require('/tmp/cyvx-vault-health.json'); if(!x.ok||!x.audit.valid) process.exit(1); console.log('LIVE HEALTH OK:',x.service,'audit events:',x.audit.events)"
else
  echo "Runtime health skipped: server is not currently running. Unit/integration tests passed."
fi
