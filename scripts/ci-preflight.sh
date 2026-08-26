#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { echo "CI PREFLIGHT: FAIL — $1" >&2; exit 1; }
ok() { echo "CI PREFLIGHT: OK — $1"; }

command -v node >/dev/null 2>&1 || fail "Node.js is missing"
command -v npm >/dev/null 2>&1 || fail "npm is missing"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || fail "Node.js 22+ required; found $(node -v)"
ok "Node $(node -v)"
ok "npm $(npm -v)"

[ -f package.json ] || fail "package.json missing"
[ -f package-lock.json ] || fail "package-lock.json missing"

node - <<'NODE'
const p=require('./package.json');
const l=require('./package-lock.json');
if (p.name !== l.name) {
  console.error(`package name mismatch: ${p.name} != ${l.name}`);
  process.exit(1);
}
console.log(`package metadata: ${p.name}@${p.version}; lock root ${l.version}`);
NODE
ok "package metadata"

npm ci --no-audit --no-fund
ok "locked dependency installation"

for f in \
  ./api/runtime-v7.js \
  ./api/index.js \
  ./spark/server.js \
  ./status/server.js \
  ./scripts/build.js \
  ./scripts/check-v7.js \
  ./scripts/package-v7.js \
  ./scripts/verify-runtime.js
 do
  [ -f "$f" ] || fail "missing authoritative file: $f"
  node --check "$f" >/dev/null || fail "syntax error: $f"
 done
ok "authoritative JavaScript syntax"

npm run build
ok "deterministic build"

echo
printf '%s\n' '============================================' 'CYVX CI PREFLIGHT: GREEN' '============================================'
