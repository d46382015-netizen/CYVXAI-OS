#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.foundry/bin:$PATH"

ensure_env() {
  if [ ! -f .env ]; then
    cp .env.example .env
    chmod 600 .env
  fi
}

load_env() {
  ensure_env
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
}

bootstrap() {
  for command in curl git python3; do
    command -v "$command" >/dev/null 2>&1 || {
      echo "Missing required command: $command" >&2
      exit 1
    }
  done
  if ! command -v forge >/dev/null 2>&1; then
    curl -L https://foundry.paradigm.xyz | bash
    export PATH="$HOME/.foundry/bin:$PATH"
    foundryup
  fi
  if [ ! -f lib/forge-std/src/Test.sol ]; then
    rm -rf lib/forge-std
    forge install foundry-rs/forge-std --no-git || forge install foundry-rs/forge-std --no-commit
  fi
  forge --version
}

configure() {
  ensure_env
  python3 ops/configure_mainnet.py
}

start_rpc() {
  configure
  load_env
  mkdir -p data logs
  local pid_file=data/readonly-rpc.pid
  local log_file=logs/readonly-rpc.log
  if [ -f "$pid_file" ]; then
    local old_pid
    old_pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      echo "Read-only RPC already running with PID $old_pid"
      return 0
    fi
    rm -f "$pid_file"
  fi
  nohup env \
    READ_RPC_UPSTREAM="$READ_RPC_UPSTREAM" \
    READ_RPC_HOST="${READ_RPC_HOST:-127.0.0.1}" \
    READ_RPC_PORT="${READ_RPC_PORT:-18545}" \
    python3 ops/readonly_rpc.py > "$log_file" 2>&1 &
  local pid=$!
  echo "$pid" > "$pid_file"
  for _ in $(seq 1 40); do
    if curl --fail --silent "http://${READ_RPC_HOST:-127.0.0.1}:${READ_RPC_PORT:-18545}/health" >/dev/null; then
      local chain_id
      chain_id="$(curl --fail --silent \
        -H 'content-type: application/json' \
        --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
        "http://${READ_RPC_HOST:-127.0.0.1}:${READ_RPC_PORT:-18545}" \
        | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result", ""))')"
      [ "$chain_id" = "0x1" ] || break
      echo "Read-only RPC started: http://${READ_RPC_HOST:-127.0.0.1}:${READ_RPC_PORT:-18545}"
      return 0
    fi
    sleep 0.25
  done
  kill "$pid" 2>/dev/null || true
  rm -f "$pid_file"
  cat "$log_file" >&2 || true
  exit 1
}

stop_pid() {
  local pid_file="$1"
  if [ ! -f "$pid_file" ]; then
    return 0
  fi
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
  rm -f "$pid_file"
}

stop_rpc() {
  stop_pid data/readonly-rpc.pid
  echo "Read-only RPC stopped."
}

quote_scan() {
  bootstrap
  start_rpc
  python3 ops/quote_engine.py
  python3 ops/record.py quote_scan passed data/latest-quotes.json || true
}

verify() {
  bootstrap
  ensure_env
  if ! grep -qE '^READ_RPC_UPSTREAM=https://' .env; then
    printf '\nREAD_RPC_UPSTREAM=https://ethereum-rpc.publicnode.com\n' >> .env
  fi
  python3 -m py_compile \
    ops/configure_mainnet.py \
    ops/readonly_rpc.py \
    ops/quote_engine.py \
    ops/config_check.py \
    ops/record.py \
    dashboard/server.py
  PYTHONPATH=ops python3 -m unittest -v ops/test_runtime.py
  python3 ops/config_check.py
  mkdir -p logs data
  local log_file="logs/verify-$(date -u +%Y%m%dT%H%M%SZ).log"
  python3 ops/record.py verify started "$log_file" || true
  if {
    forge fmt --check
    forge build --sizes
    forge test -vvv
  } 2>&1 | tee "$log_file"; then
    python3 ops/record.py verify passed "$log_file" || true
    echo "Validation passed. Log: $log_file"
  else
    local result=$?
    python3 ops/record.py verify failed "$log_file" || true
    exit "$result"
  fi
}

fork_simulate() {
  quote_scan
  load_env
  [ "${ENABLE_LIVE:-}" = "false" ] || { echo "ENABLE_LIVE must be false" >&2; exit 1; }
  mkdir -p data logs
  python3 - <<'PY'
import json
from decimal import Decimal
from pathlib import Path

root = Path.cwd()
data = json.loads((root / "data/latest-quotes.json").read_text())
best = data.get("bestCandidate")
required = Decimal("1.00")
for raw in (root / ".env").read_text().splitlines():
    if raw.startswith("FORK_REQUIRED_NET_USDC="):
        required = Decimal(raw.split("=", 1)[1].strip())
        break
required_raw = int(required * 10**6)
path = root / "data/fork-candidate.env"
if not best or int(best["expectedNetUSDC"]) < required_raw:
    path.write_text("RUN_CANDIDATE=false\n")
else:
    values = {
        "RUN_CANDIDATE": "true",
        "BLOCK_NUMBER": data["blockNumber"],
        "DIRECTION": best["direction"],
        "FEE_TIER": best["feeTier"],
        "AMOUNT_IN": best["amountInUSDC"],
        "FIRST_MIN_OUT": best["firstMinOut"],
        "SECOND_MIN_OUT": best["secondMinOutUSDC"],
        "EXPECTED_NET": best["expectedNetUSDC"],
    }
    path.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
PY
  # shellcheck disable=SC1091
  source data/fork-candidate.env
  if [ "$RUN_CANDIDATE" != "true" ]; then
    python3 ops/record.py fork_simulation skipped "No route cleared the threshold" || true
    echo "No route cleared FORK_REQUIRED_NET_USDC; no local transaction was executed."
    return 0
  fi

  local host="${ANVIL_HOST:-127.0.0.1}"
  local port="${ANVIL_PORT:-18546}"
  local local_rpc="http://${host}:${port}"
  local anvil_key='0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
  local anvil_owner='0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
  stop_pid data/anvil.pid
  nohup anvil \
    --fork-url "$MAINNET_RPC_URL" \
    --fork-block-number "$BLOCK_NUMBER" \
    --host "$host" \
    --port "$port" \
    --silent > logs/anvil-fork.log 2>&1 &
  echo $! > data/anvil.pid
  trap 'stop_pid data/anvil.pid' EXIT INT TERM
  for _ in $(seq 1 100); do
    cast chain-id --rpc-url "$local_rpc" >/dev/null 2>&1 && break
    sleep 0.2
  done
  cast chain-id --rpc-url "$local_rpc" >/dev/null 2>&1 || {
    cat logs/anvil-fork.log >&2
    exit 1
  }

  local deploy_output contract
  deploy_output="$(forge create src/FlashArb.sol:FlashArb \
    --constructor-args "$AAVE_POOL_ADDRESS" "$anvil_owner" "$anvil_owner" \
    --rpc-url "$local_rpc" \
    --private-key "$anvil_key" \
    --broadcast 2>&1)"
  printf '%s\n' "$deploy_output" > logs/fork-deploy.log
  contract="$(printf '%s\n' "$deploy_output" | sed -nE 's/^Deployed to: (0x[0-9a-fA-F]{40})$/\1/p' | tail -n 1)"
  [ -n "$contract" ] || { cat logs/fork-deploy.log >&2; exit 1; }

  local send_args=(--rpc-url "$local_rpc" --private-key "$anvil_key" --gas-limit 1500000)
  cast send "$contract" 'setTokenAllowed(address,bool)' "$USDC_ADDRESS" true "${send_args[@]}" >/dev/null
  cast send "$contract" 'setTokenAllowed(address,bool)' "$WETH_ADDRESS" true "${send_args[@]}" >/dev/null
  cast send "$contract" 'setRouterAllowed(address,bool)' "$UNISWAP_V3_ROUTER" true "${send_args[@]}" >/dev/null
  cast send "$contract" 'setRouterAllowed(address,bool)' "$SUSHI_V2_ROUTER" true "${send_args[@]}" >/dev/null

  local min_profit deadline first second
  min_profit="$(python3 - <<'PY'
from decimal import Decimal, ROUND_DOWN
import os
print(int((Decimal(os.environ.get("FORK_MIN_PROFIT_USDC", "1.00")) * Decimal(10**6)).to_integral_value(rounding=ROUND_DOWN)))
PY
)"
  deadline="$(python3 - "$local_rpc" <<'PY'
import json, sys, urllib.request
body = json.dumps({"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["latest",False]}).encode()
request = urllib.request.Request(sys.argv[1], data=body, headers={"content-type":"application/json"})
with urllib.request.urlopen(request, timeout=10) as response:
    block = json.load(response)["result"]
print(int(block["timestamp"], 16) + 60)
PY
)"
  if [ "$DIRECTION" = "UNI_V3_TO_SUSHI_V2" ]; then
    first="(1,$UNISWAP_V3_ROUTER,$USDC_ADDRESS,$WETH_ADDRESS,$FEE_TIER,$FIRST_MIN_OUT)"
    second="(0,$SUSHI_V2_ROUTER,$WETH_ADDRESS,$USDC_ADDRESS,0,$SECOND_MIN_OUT)"
  else
    first="(0,$SUSHI_V2_ROUTER,$USDC_ADDRESS,$WETH_ADDRESS,0,$FIRST_MIN_OUT)"
    second="(1,$UNISWAP_V3_ROUTER,$WETH_ADDRESS,$USDC_ADDRESS,$FEE_TIER,$SECOND_MIN_OUT)"
  fi

  local tx_output balance tx_hash gas_used
  tx_output="$(cast send "$contract" \
    'executeArbitrage(address,uint256,uint256,uint256,(uint8,address,address,address,uint24,uint256),(uint8,address,address,address,uint24,uint256))' \
    "$USDC_ADDRESS" "$AMOUNT_IN" "$min_profit" "$deadline" "$first" "$second" \
    "${send_args[@]}" 2>&1)" || {
      printf '%s\n' "$tx_output" > logs/fork-execution.log
      python3 ops/record.py fork_simulation failed logs/fork-execution.log || true
      cat logs/fork-execution.log >&2
      exit 1
    }
  printf '%s\n' "$tx_output" > logs/fork-execution.log
  balance="$(cast call "$USDC_ADDRESS" 'balanceOf(address)(uint256)' "$contract" --rpc-url "$local_rpc" | awk '{print $1}')"
  tx_hash="$(printf '%s\n' "$tx_output" | sed -nE 's/^transactionHash[[:space:]]+(0x[0-9a-fA-F]{64})$/\1/p' | tail -n 1)"
  gas_used="$(printf '%s\n' "$tx_output" | sed -nE 's/^gasUsed[[:space:]]+([0-9]+)$/\1/p' | tail -n 1)"
  python3 - "$contract" "$balance" "$gas_used" "$tx_hash" <<'PY'
import json, sys
from datetime import datetime, timezone
from pathlib import Path
contract, balance, gas_used, tx_hash = sys.argv[1:]
payload = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "mode": "local-mainnet-fork",
    "liveBroadcast": False,
    "contract": contract,
    "profitBalanceUSDC": int(balance),
    "gasUsed": int(gas_used) if gas_used else None,
    "transactionHash": tx_hash or None,
}
Path("data/latest-fork-simulation.json").write_text(json.dumps(payload, indent=2) + "\n")
print(json.dumps(payload, indent=2))
PY
  python3 ops/record.py fork_simulation passed data/latest-fork-simulation.json || true
  echo "Local fork simulation succeeded. No relay submission occurred."
}

dashboard_start() {
  load_env
  mkdir -p data logs
  local pid_file=data/dashboard.pid
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "Dashboard already running: http://127.0.0.1:${DASHBOARD_PORT:-8789}"
      return 0
    fi
  fi
  nohup python3 dashboard/server.py > logs/dashboard.log 2>&1 &
  echo $! > "$pid_file"
  sleep 1
  echo "Dashboard started: http://127.0.0.1:${DASHBOARD_PORT:-8789}"
}

dashboard_stop() {
  stop_pid data/dashboard.pid
  echo "Dashboard stopped."
}

status() {
  if curl --fail --silent http://127.0.0.1:8789/api/status; then
    printf '\n'
  else
    echo "Dashboard is not running."
  fi
}

run_all() {
  bootstrap
  configure
  start_rpc
  forge fmt
  verify
  quote_scan
  dashboard_start
  echo "CYVX Flash Relay running in read-only/fork-only mode."
  echo "Dashboard: http://127.0.0.1:8789"
  echo "Fork:      ./scripts/cyvx.sh fork"
}

case "${1:-run}" in
  bootstrap) bootstrap ;;
  configure) configure ;;
  rpc) start_rpc ;;
  quote) quote_scan ;;
  fork) fork_simulate ;;
  verify) verify ;;
  dashboard) dashboard_start ;;
  status) status ;;
  stop-rpc) stop_rpc ;;
  stop-dashboard) dashboard_stop ;;
  stop) dashboard_stop; stop_rpc; stop_pid data/anvil.pid ;;
  run) run_all ;;
  *)
    echo "Usage: $0 {run|bootstrap|configure|rpc|quote|fork|verify|dashboard|status|stop}" >&2
    exit 2
    ;;
esac
