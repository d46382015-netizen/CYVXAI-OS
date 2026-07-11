#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="${CYVX_DATA_ROOT:-$REPO_ROOT/.cyvx}"
BACKUP_DIR="${CYVX_BACKUP_DIR:-$DATA_DIR/backups}"
OUTPUT="${1:-$BACKUP_DIR/cyvx-mission-$(date -u +%Y%m%dT%H%M%SZ).tar.gz}"

mkdir -p "$(dirname "$OUTPUT")"
cd "$REPO_ROOT"
node - "$DATA_DIR" "$OUTPUT" <<'NODE'
const path = require('node:path');
const { createMissionRuntime } = require('./runtime/missions');
const { createBackup } = require('./runtime/missions/backup');
const dataRoot = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const runtime = createMissionRuntime({ dataRoot });
try {
  const result = createBackup({ runtime, output });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  runtime.close();
}
NODE
