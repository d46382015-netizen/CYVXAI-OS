#!/usr/bin/env bash
set -euo pipefail

# CYVXAI-OS Restore Script
# © 2026 Dakota Lee Jonsgaard. All rights reserved.

if [ -z "${1:-}" ]; then
  echo "Usage: bash scripts/restore.sh <backup_file>"
  exit 1
fi

BACKUP_FILE="$1"
DATA_DIR="${CYVX_DATA_ROOT:-.cyvx}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Restoring from backup: $BACKUP_FILE"
mkdir -p "$(dirname "$DATA_DIR")"
tar -xzf "$BACKUP_FILE" -C "$(dirname "$DATA_DIR")"
echo "Restore complete"
