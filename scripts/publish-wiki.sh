#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
DIST="$WORK/generated"
CLONE="$WORK/wiki"
trap 'rm -rf "$WORK"' EXIT

command -v node >/dev/null 2>&1 || { echo "ERROR: node is required" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "ERROR: git is required" >&2; exit 1; }

node --check "$ROOT/scripts/generate-wiki-v2.js"
node "$ROOT/scripts/generate-wiki-v2.js" "$DIST"

PAGE_COUNT="$(find "$DIST" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"
if [ "$PAGE_COUNT" -lt 19 ]; then
  echo "ERROR: expected at least 19 generated Markdown files, found $PAGE_COUNT" >&2
  exit 1
fi

REPOSITORY="${CYVX_REPOSITORY:-d46382015-netizen/CYVXAI-OS}"
if [ -n "${GH_TOKEN:-}" ]; then
  WIKI_URL="https://x-access-token:${GH_TOKEN}@github.com/${REPOSITORY}.wiki.git"
else
  WIKI_URL="${CYVX_WIKI_URL:-https://github.com/${REPOSITORY}.wiki.git}"
fi

git clone "$WIKI_URL" "$CLONE"
find "$CLONE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$DIST"/. "$CLONE"/

cd "$CLONE"
git config user.name "${GIT_AUTHOR_NAME:-Dakota Jonsgaard}"
git config user.email "${GIT_AUTHOR_EMAIL:-pbgkota93@gmail.com}"
git add -A

if git diff --cached --quiet; then
  echo "CYVX Wiki is already current ($PAGE_COUNT files)."
  exit 0
fi

git commit -m "Publish CYVXAI-OS production wiki"
git push origin HEAD

echo "CYVX Wiki published successfully ($PAGE_COUNT files)."
