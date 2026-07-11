#!/usr/bin/env bash
set -euo pipefail

# CYVXAI-OS Health Diagnostic
# © 2026 Dakota Lee Jonsgaard. All rights reserved.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== CYVXAI-OS Diagnostics ===${NC}"
echo ""

echo -e "${YELLOW}Environment${NC}"
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "User: $(whoami)"
echo "Platform: $(uname -s)"
echo "Architecture: $(uname -m)"
echo ""

echo -e "${YELLOW}Repository${NC}"
echo "Root: $REPO_ROOT"
echo "Git branch: $(cd $REPO_ROOT && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'N/A')"
echo "Git commit: $(cd $REPO_ROOT && git rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
echo ""

echo -e "${YELLOW}Dependencies${NC}"
cd "$REPO_ROOT"
if npm list --depth=0 2>/dev/null | head -20; then
  echo "Dependencies OK"
else
  echo -e "${RED}Warning: Some dependencies may be missing${NC}"
  echo "Run: npm install"
fi
echo ""

echo -e "${YELLOW}Filesystem${NC}"
echo "Disk usage: $(du -sh $REPO_ROOT 2>/dev/null || echo 'N/A')"
echo "Home directory writable: $(test -w ~ && echo 'Yes' || echo 'No')"
echo ""

echo -e "${YELLOW}Database${NC}"
if command -v sqlite3 &> /dev/null; then
  echo "sqlite3 available: $(sqlite3 --version)"
else
  echo -e "${RED}sqlite3 not found${NC}"
fi
echo ""

echo -e "${YELLOW}Configuration${NC}"
if [ -f "$REPO_ROOT/.env" ]; then
  echo "Local .env exists: Yes"
else
  echo "Local .env exists: No (using defaults)"
fi
echo ""

echo -e "${YELLOW}Network${NC}"
echo "Port 3000 available: $(nc -z 127.0.0.1 3000 2>/dev/null && echo 'No (in use)' || echo 'Yes')"
echo "Port 9001 available: $(nc -z 127.0.0.1 9001 2>/dev/null && echo 'No (in use)' || echo 'Yes')"
echo ""

echo -e "${YELLOW}Next Steps${NC}"
echo "1. Run: cd $REPO_ROOT && bash run.sh"
echo "2. Visit: http://localhost:3000"
echo "3. Run tests: bash scripts/test-integration.sh"
echo ""

echo -e "${GREEN}Diagnostic complete${NC}"
