#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${1:-}" ]]; then
  echo "Usage: CYVX_ALLOW_RESTORE=1 bash scripts/restore.sh <backup.tar.gz> [clean-target-data-root]" >&2
  exit 64
fi
if [[ "${CYVX_ALLOW_RESTORE:-0}" != "1" ]]; then
  echo "Restore is protected. Set CYVX_ALLOW_RESTORE=1 after validating the target." >&2
  exit 77
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
ARCHIVE="$(realpath "$1")"
TARGET="${2:-${CYVX_DATA_ROOT:-$REPO_ROOT/.cyvx-restored}}"

[[ -f "$ARCHIVE" ]] || { echo "Backup file not found: $ARCHIVE" >&2; exit 66; }
cd "$REPO_ROOT"
node - "$ARCHIVE" "$TARGET" <<'NODE'
const path = require('node:path');
const { restoreBackup } = require('./runtime/missions/backup');
const { createMissionRuntime } = require('./runtime/missions');
const archive = path.resolve(process.argv[2]);
const targetDataRoot = path.resolve(process.argv[3]);
const result = restoreBackup({ archive, targetDataRoot, allow: true });
const runtime = createMissionRuntime({ dataRoot: targetDataRoot });
try {
  const database = runtime.db.prepare('SELECT 1 AS ok').get();
  if (!database || database.ok !== 1) throw new Error('Restored database validation failed');
  process.stdout.write(`${JSON.stringify({ ...result, database_verified: true }, null, 2)}\n`);
} finally {
  runtime.close();
}
NODE
