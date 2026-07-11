#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
AAVE_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
DEFAULT_CANDIDATES = [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
    "https://cloudflare-eth.com",
    "https://1rpc.io/eth",
]
ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")

DEFAULTS = {
    "ENABLE_LIVE": "false",
    "CHAIN_ID": "1",
    "AAVE_POOL_ADDRESS": AAVE_POOL,
    "USDC_ADDRESS": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "WETH_ADDRESS": "0xC02aaA39b223FE8D0A0e5C4F27ead9083C756Cc2",
    "UNISWAP_V3_QUOTER": "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
    "UNISWAP_V3_ROUTER": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    "SUSHI_V2_ROUTER": "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    "MAINNET_RPC_URL": "http://127.0.0.1:18545",
    "READ_RPC_HOST": "127.0.0.1",
    "READ_RPC_PORT": "18545",
    "ANVIL_HOST": "127.0.0.1",
    "ANVIL_PORT": "18546",
    "QUOTE_AMOUNTS_USDC": "1000,5000,10000,25000,50000,100000",
    "UNISWAP_FEE_TIERS": "500,3000,10000",
    "QUOTE_SLIPPAGE_BPS": "15",
    "GAS_UNITS_ASSUMPTION": "450000",
    "FORK_REQUIRED_NET_USDC": "1.00",
    "FORK_MIN_PROFIT_USDC": "1.00",
    "FLASHBOTS_RELAY_URL": "https://relay.flashbots.net",
    "DASHBOARD_HOST": "127.0.0.1",
    "DASHBOARD_PORT": "8789",
}


def load_env(path: Path) -> tuple[dict[str, str], list[str]]:
    values: dict[str, str] = {}
    untouched: list[str] = []
    if not path.exists():
        return values, untouched
    for raw in path.read_text(encoding="utf-8").splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#") or "=" not in raw:
            untouched.append(raw)
            continue
        key, value = raw.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values, untouched


def rpc(url: str, method: str, params: list[Any], timeout: float = 12.0) -> Any:
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        separators=(",", ":"),
    ).encode()
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "cyvx-flash-relay-config/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        result = json.load(response)
    if "error" in result:
        raise RuntimeError(f"{method}: {result['error']}")
    return result.get("result")


def validate_endpoint(url: str) -> dict[str, Any]:
    if not url.startswith("https://"):
        raise RuntimeError("upstream must use HTTPS")
    chain_id = rpc(url, "eth_chainId", [])
    if chain_id != "0x1":
        raise RuntimeError(f"wrong chain id: {chain_id}")
    block_hex = rpc(url, "eth_blockNumber", [])
    if not isinstance(block_hex, str) or not block_hex.startswith("0x"):
        raise RuntimeError("invalid block number response")
    code = rpc(url, "eth_getCode", [AAVE_POOL, "latest"])
    if not isinstance(code, str) or code in {"0x", "0x0", ""}:
        raise RuntimeError("Aave pool has no bytecode")
    return {
        "url": url,
        "chainId": int(chain_id, 16),
        "blockNumber": int(block_hex, 16),
        "aavePoolCodeBytes": (len(code) - 2) // 2,
    }


def persist(values: dict[str, str], untouched: list[str]) -> None:
    managed = set(DEFAULTS) | {"READ_RPC_UPSTREAM"}
    lines = [line for line in untouched if line.strip()]
    for key, value in values.items():
        if key not in managed:
            lines.append(f"{key}={value}")
    lines.append("")
    lines.append("# CYVX managed Ethereum mainnet configuration")
    for key in DEFAULTS:
        lines.append(f"{key}={values[key]}")
    lines.append(f"READ_RPC_UPSTREAM={values['READ_RPC_UPSTREAM']}")
    lines.append("")

    ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".env.", dir=str(ENV_PATH.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write("\n".join(lines))
        os.chmod(temp_name, 0o600)
        os.replace(temp_name, ENV_PATH)
    finally:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass


def main() -> int:
    values, untouched = load_env(ENV_PATH)
    values.update({key: values.get(key, value) for key, value in DEFAULTS.items()})
    values["ENABLE_LIVE"] = "false"
    values["CHAIN_ID"] = "1"
    values["AAVE_POOL_ADDRESS"] = AAVE_POOL
    values["MAINNET_RPC_URL"] = "http://127.0.0.1:18545"

    for key in (
        "OWNER_ADDRESS",
        "OPERATOR_ADDRESS",
        "AAVE_POOL_ADDRESS",
        "USDC_ADDRESS",
        "WETH_ADDRESS",
        "UNISWAP_V3_QUOTER",
        "UNISWAP_V3_ROUTER",
        "SUSHI_V2_ROUTER",
    ):
        value = values.get(key, "")
        if not ADDRESS_RE.fullmatch(value):
            print(f"Invalid or missing {key}: {value!r}", file=sys.stderr)
            return 1

    candidates: list[str] = []
    for candidate in [values.get("READ_RPC_UPSTREAM", ""), *DEFAULT_CANDIDATES]:
        candidate = candidate.strip().rstrip("/")
        if candidate and candidate not in candidates:
            candidates.append(candidate)

    failures: list[str] = []
    selected: dict[str, Any] | None = None
    for candidate in candidates:
        try:
            selected = validate_endpoint(candidate)
            break
        except (RuntimeError, urllib.error.URLError, TimeoutError, ValueError) as exc:
            failures.append(f"{candidate}: {exc}")

    if selected is None:
        print("No validated Ethereum mainnet read endpoint was available.", file=sys.stderr)
        for failure in failures:
            print(f" - {failure}", file=sys.stderr)
        print(
            "Set READ_RPC_UPSTREAM in .env to an HTTPS Ethereum mainnet endpoint and rerun.",
            file=sys.stderr,
        )
        return 1

    values["READ_RPC_UPSTREAM"] = str(selected["url"])
    persist(values, untouched)
    output = ROOT / "data" / "rpc-selection.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(selected, indent=2) + "\n", encoding="utf-8")

    print("Ethereum mainnet read endpoint configured.")
    print(f"Upstream:   {selected['url']}")
    print(f"Block:      {selected['blockNumber']}")
    print(f"Aave pool:  {AAVE_POOL}")
    print("Local RPC:  http://127.0.0.1:18545")
    print("Live mode:  disabled")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
