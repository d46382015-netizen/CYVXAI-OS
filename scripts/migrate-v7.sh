#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_URL="${CYVX_DATABASE_URL:-${DATABASE_URL:-}}"

if [ -z "$DATABASE_URL" ]; then
  echo "CYVX_DATABASE_URL or DATABASE_URL is required" >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to apply managed PostgreSQL migrations" >&2
  exit 1
fi

export PGSSLMODE="${PGSSLMODE:-require}"
for migration in "$ROOT"/ops/postgres/*.sql; do
  echo "Applying $(basename "$migration")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "select cyvx_health();"
