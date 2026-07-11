#!/usr/bin/env bash
set -euo pipefail

# CYVXAI-OS Main Startup Script
# © 2026 Dakota Lee Jonsgaard. All rights reserved.
# One command to start the entire platform

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Starting CYVXAI-OS..."

# Detect environment
if [ -z "${NODE_ENV:-}" ]; then
  export NODE_ENV="development"
fi

# Create data directories
mkdir -p .cyvx/logs .cyvx/backups

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "Error: Node.js not found"
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Apply migrations
echo "Applying database migrations..."
node -e "
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const dbPath = path.join(process.env.CYVX_DATA_ROOT || '.cyvx', 'cyvx.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
const schema = fs.readFileSync('./ops/sqlite/001_mission_workflow.sql', 'utf8');
db.exec(schema);
console.log('Migrations applied');
"

# Start the platform
echo "Starting API server..."
node api/public.js
