#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${CONTENT_OS_DATA_DIR:-$HOME/.cyvx/content-os}"
DB_PATH="${CONTENT_OS_DB_PATH:-$DATA_DIR/content-os.db}"
HOST="${CONTENT_OS_HOST:-127.0.0.1}"
PORT="${CONTENT_OS_PORT:-3050}"
PID_DIR="$DATA_DIR/run"
LOG_DIR="$DATA_DIR/logs"
SERVER_PID="$PID_DIR/server.pid"
WORKER_PID="$PID_DIR/worker.pid"
SERVER_LOG="$LOG_DIR/server-console.log"
WORKER_LOG="$LOG_DIR/worker-console.log"
COMMAND="${1:-start}"

mkdir -p "$PID_DIR" "$LOG_DIR"

require_command() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

check_runtime() {
  require_command node
  require_command ffmpeg
  require_command ffprobe
  local major
  major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if (( major < 22 )); then
    echo "CYVX Content OS requires Node.js 22 or newer; found $(node -v)." >&2
    exit 1
  fi
}

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

stop_pid() {
  local pid_file="$1"
  local label="$2"
  if ! is_running "$pid_file"; then
    rm -f "$pid_file"
    echo "$label is not running."
    return 0
  fi
  local pid
  pid="$(cat "$pid_file")"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 30); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.2
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$pid_file"
  echo "$label stopped."
}

healthcheck() {
  CONTENT_OS_HEALTH_URL="http://$HOST:$PORT/health" node - <<'NODE'
const url = process.env.CONTENT_OS_HEALTH_URL;
fetch(url, { signal: AbortSignal.timeout(3000) })
  .then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (!body.ok || !body.ffmpeg) throw new Error(JSON.stringify(body));
    process.stdout.write(`${JSON.stringify(body)}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
NODE
}

export CONTENT_OS_DATA_DIR="$DATA_DIR"
export CONTENT_OS_DB_PATH="$DB_PATH"
export CONTENT_OS_HOST="$HOST"
export CONTENT_OS_PORT="$PORT"

case "$HOST" in
  127.0.0.1|localhost|::1)
    export CONTENT_OS_ALLOW_INSECURE_LOCAL="${CONTENT_OS_ALLOW_INSECURE_LOCAL:-true}"
    ;;
  *)
    export CONTENT_OS_ALLOW_INSECURE_LOCAL="false"
    if [[ ${#CONTENT_OS_API_TOKEN:-0} -lt 32 ]]; then
      echo "Set CONTENT_OS_API_TOKEN to at least 32 characters before binding outside loopback." >&2
      exit 1
    fi
    ;;
esac

case "$COMMAND" in
  server)
    check_runtime
    exec node "$ROOT/services/content-os/server.js"
    ;;
  worker)
    check_runtime
    exec node "$ROOT/services/content-os/worker.js"
    ;;
  once)
    check_runtime
    exec node "$ROOT/services/content-os/worker.js" --once
    ;;
  verify)
    check_runtime
    exec node "$ROOT/scripts/verify-content-os.js"
    ;;
  start)
    check_runtime
    if is_running "$SERVER_PID" || is_running "$WORKER_PID"; then
      echo "CYVX Content OS is already running."
      "$0" status
      exit 0
    fi
    rm -f "$SERVER_PID" "$WORKER_PID"
    nohup node "$ROOT/services/content-os/server.js" >>"$SERVER_LOG" 2>&1 &
    echo $! > "$SERVER_PID"
    for _ in $(seq 1 30); do
      if healthcheck >/dev/null 2>&1; then break; fi
      if ! is_running "$SERVER_PID"; then
        echo "Content OS API failed to start. See $SERVER_LOG" >&2
        tail -n 40 "$SERVER_LOG" >&2 || true
        exit 1
      fi
      sleep 0.3
    done
    healthcheck >/dev/null || { echo "Content OS API did not become healthy. See $SERVER_LOG" >&2; exit 1; }
    nohup node "$ROOT/services/content-os/worker.js" >>"$WORKER_LOG" 2>&1 &
    echo $! > "$WORKER_PID"
    sleep 0.4
    if ! is_running "$WORKER_PID"; then
      echo "Content OS worker failed to start. See $WORKER_LOG" >&2
      tail -n 40 "$WORKER_LOG" >&2 || true
      stop_pid "$SERVER_PID" "API" >/dev/null
      exit 1
    fi
    echo "CYVX Content OS started at http://$HOST:$PORT"
    echo "Database: $DB_PATH"
    echo "Logs: $LOG_DIR"
    ;;
  stop)
    stop_pid "$WORKER_PID" "Worker"
    stop_pid "$SERVER_PID" "API"
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    if is_running "$SERVER_PID"; then echo "API: running (PID $(cat "$SERVER_PID"))"; else echo "API: stopped"; fi
    if is_running "$WORKER_PID"; then echo "Worker: running (PID $(cat "$WORKER_PID"))"; else echo "Worker: stopped"; fi
    if healthcheck 2>/dev/null; then :; else echo "Health: unavailable"; fi
    ;;
  logs)
    touch "$SERVER_LOG" "$WORKER_LOG"
    tail -n 80 "$SERVER_LOG" "$WORKER_LOG"
    ;;
  *)
    echo "Usage: bash ./scripts/content-os.sh {start|stop|restart|status|logs|server|worker|once|verify}" >&2
    exit 2
    ;;
esac
