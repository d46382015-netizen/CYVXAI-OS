#!/usr/bin/env bash
set -euo pipefail

# CYVXAI-OS Backup Script
# © 2026 Dakota Lee Jonsgaard. All rights reserved.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="${CYVX_DATA_ROOT:-.cyvx}"
BACKUP_DIR="${DATA_DIR}/backups"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${BACKUP_TIMESTAMP}.tar.gz"

echo "Creating backup..."
mkdir -p "$BACKUP_DIR"

# Backup database
if [ -f "${DATA_DIR}/cyvx.db" ]; then
  tar -czf "$BACKUP_FILE" \
    -C "$(dirname "$DATA_DIR")" \
    "$(basename "$DATA_DIR")"
  echo "Backup created: $BACKUP_FILE"
  echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"
else
  echo "No database found"
  exit 1
fi
