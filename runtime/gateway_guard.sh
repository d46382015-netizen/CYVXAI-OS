#!/bin/sh

set -e

echo "[EOS-STABILIZER] verifying gateway binary..."

if ! command -v openclaw >/dev/null 2>&1; then
  if [ "${CYVX_GATEWAY_REQUIRED:-0}" = "1" ]; then
    echo "[FATAL] openclaw gateway missing - aborting boot"
    exit 127
  fi
  echo "[WARN] openclaw gateway missing - continuing with local runtime"
  exit 0
fi

echo "[OK] gateway exists"
