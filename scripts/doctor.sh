#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

failures=0
check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then printf 'OK   %s\n' "$label";
  else printf 'FAIL %s\n' "$label" >&2; failures=$((failures+1)); fi
}

printf 'CYVXAI-OS runtime doctor\n'
printf 'repository=%s\n' "$REPO_ROOT"
printf 'commit=%s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
printf 'platform=%s/%s\n' "$(uname -s)" "$(uname -m)"
printf 'node=%s\n' "$(node --version 2>/dev/null || echo missing)"
printf 'npm=%s\n' "$(npm --version 2>/dev/null || echo missing)"

check "Node.js 22+" node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
check "npm executable" npm --version
check "package lock" test -f package-lock.json
check "public gateway" test -f api/public.js
check "mission runtime" test -f runtime/missions/index.js
check "worker process" test -f runtime/missions/worker.js
check "base migration" test -f ops/sqlite/001_mission_workflow.sql
check "runtime migration" test -f ops/sqlite/002_runtime_completion.sql
check "operator UI" test -f ui/missions.html
check "backup command dependency" tar --version
check "data root writable" bash -c 'root="${CYVX_DATA_ROOT:-.cyvx}"; mkdir -p "$root/.doctor"; test -w "$root/.doctor"; rmdir "$root/.doctor"'
check "SQLite migration from zero" node -e '
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createMissionRuntime}=require("./runtime/missions");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"cyvx-doctor-"));
try{const runtime=createMissionRuntime({dataRoot:root,allowLocalAuth:true});
const versions=runtime.db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
if(versions.length!==2||versions[1].version!==2)process.exitCode=1;
runtime.close();}finally{fs.rmSync(root,{recursive:true,force:true});}
'
check "JavaScript syntax" bash -c 'find runtime/missions api -maxdepth 2 -name "*.js" -print0 | xargs -0 -n1 node --check'

if (( failures > 0 )); then
  printf '%d diagnostic check(s) failed\n' "$failures" >&2
  exit 1
fi
printf 'All runtime diagnostics passed\n'
