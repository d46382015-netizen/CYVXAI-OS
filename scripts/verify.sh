#!/usr/bin/env bash
set -euo pipefail

# CYVXAI-OS Verification Script
# © 2026 Dakota Lee Jonsgaard. All rights reserved.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

verify_check() {
  local name="$1"
  local condition="$2"
  
  if eval "$condition" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} $name"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} $name"
    ((FAILED++))
  fi
}

echo -e "${YELLOW}=== CYVXAI-OS Verification ===${NC}"
echo ""

echo -e "${YELLOW}Repository Structure${NC}"
verify_check "Mission engine" "test -f $REPO_ROOT/core/missions/mission_engine.js"
verify_check "Mission API" "test -f $REPO_ROOT/api/missions.js"
verify_check "Database schema" "test -f $REPO_ROOT/ops/sqlite/001_mission_workflow.sql"
verify_check "Public API" "test -f $REPO_ROOT/api/public.js"
verify_check "Spark server" "test -f $REPO_ROOT/spark/server.js"
echo ""

echo -e "${YELLOW}Configuration${NC}"
verify_check "package.json exists" "test -f $REPO_ROOT/package.json"
verify_check "package-lock.json exists" "test -f $REPO_ROOT/package-lock.json"
echo ""

echo -e "${YELLOW}Scripts${NC}"
verify_check "run.sh exists" "test -f $REPO_ROOT/run.sh"
verify_check "setup.sh exists" "test -f $REPO_ROOT/scripts/setup.sh"
verify_check "test-integration.sh exists" "test -f $REPO_ROOT/scripts/test-integration.sh"
verify_check "doctor.sh exists" "test -f $REPO_ROOT/scripts/doctor.sh"
verify_check "backup.sh exists" "test -f $REPO_ROOT/scripts/backup.sh"
echo ""

echo -e "${YELLOW}Tests${NC}"
verify_check "Test files present" "test -d $REPO_ROOT/test"
echo ""

echo -e "${YELLOW}Dependencies${NC}"
verify_check "Node.js available" "command -v node"
verify_check "npm available" "command -v npm"
echo ""

echo -e "${YELLOW}Summary${NC}"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}All checks passed${NC}"
  exit 0
else
  echo -e "${RED}Some checks failed${NC}"
  exit 1
fi
