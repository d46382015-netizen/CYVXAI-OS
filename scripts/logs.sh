#!/usr/bin/env bash
set -euo pipefail

# CYVXAI-OS Log Viewer
# © 2026 Dakota Lee Jonsgaard. All rights reserved.

DATA_DIR="${CYVX_DATA_ROOT:-.cyvx}"
LOGS_DIR="${DATA_DIR}/logs"

if [ ! -d "$LOGS_DIR" ]; then
  echo "No logs found"
  exit 0
fi

echo "=== Recent Logs ==="
echo ""

for log_file in $(find "$LOGS_DIR" -type f -name '*.log' | sort -r | head -5); do
  echo "File: $log_file"
  tail -20 "$log_file"
  echo ""
done
