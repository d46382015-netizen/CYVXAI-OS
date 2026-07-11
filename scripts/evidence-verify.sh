#!/usr/bin/env bash
set -Eeuo pipefail

MISSION_ID="${1:-}"
BASE_URL="${CYVX_BASE_URL:-http://127.0.0.1:${CYVX_PUBLIC_PORT:-3000}}"
TOKEN="${CYVX_AUTH_TOKEN:-}"

[[ -n "$MISSION_ID" ]] || { echo "Usage: CYVX_AUTH_TOKEN=<token> bash scripts/evidence-verify.sh <mission_id>" >&2; exit 64; }
[[ -n "$TOKEN" ]] || { echo "CYVX_AUTH_TOKEN is required" >&2; exit 77; }

response="$(curl -fsS -X POST "$BASE_URL/api/v1/evidence/verify" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  --data "{\"mission_id\":\"$MISSION_ID\"}")"
printf '%s\n' "$response"
printf '%s' "$response" | node -e '
let data="";
process.stdin.on("data", chunk => data += chunk);
process.stdin.on("end", () => {
  const payload = JSON.parse(data);
  if (!payload.ok || !payload.report || payload.report.valid !== true) process.exit(1);
});
'
