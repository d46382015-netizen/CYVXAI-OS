#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$major" -lt 22 ]; then
  echo "CYVX Vault requires Node.js 22.5+ (Node 24/26 recommended). Current: $(node -v 2>/dev/null || echo missing)" >&2
  exit 1
fi
mkdir -p data
if [ ! -f .env ]; then
  admin_password="$(node -e "console.log(require('node:crypto').randomBytes(12).toString('hex'))")"
  cat > .env <<ENV
HOST=0.0.0.0
PORT=8789
DATA_DIR=./data
ADMIN_EMAIL=admin@cyvx.local
ADMIN_PASSWORD=$admin_password
BUYBACK_BPS=8500
PAID_PACKS_ENABLED=false
PUBLIC_ORIGIN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
ENV
  umask 077
  printf 'Email: admin@cyvx.local\nPassword: %s\n' "$admin_password" > data/admin-credentials.txt
fi
set -a
# shellcheck disable=SC1091
source .env
set +a
echo "CYVX Vault: http://127.0.0.1:${PORT:-8789}"
echo "Operator credentials: $(tr '\n' ' ' < data/admin-credentials.txt 2>/dev/null || echo 'see .env')"
exec node src/server.mjs
