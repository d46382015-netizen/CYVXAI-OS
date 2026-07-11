#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
ADDRESS = re.compile(r"^0x[a-fA-F0-9]{40}$")
REQUIRED_ADDRESSES = (
    "OWNER_ADDRESS",
    "OPERATOR_ADDRESS",
    "AAVE_POOL_ADDRESS",
    "USDC_ADDRESS",
    "WETH_ADDRESS",
    "UNISWAP_V3_QUOTER",
    "UNISWAP_V3_ROUTER",
    "SUSHI_V2_ROUTER",
)
FORBIDDEN = (
    "PRIVATE_KEY",
    "DEPLOYER_PRIVATE_KEY",
    "MNEMONIC",
    "SEED_PHRASE",
    "PASSPHRASE",
    "FLASHBOTS_AUTH_KEY",
)


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if not ENV_FILE.exists():
        raise RuntimeError(".env is missing")
    for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def main() -> int:
    env = load_env()
    errors: list[str] = []
    for key in REQUIRED_ADDRESSES:
        if not ADDRESS.fullmatch(env.get(key, "")):
            errors.append(f"{key} must be a valid EVM address")
    if env.get("ENABLE_LIVE", "").lower() != "false":
        errors.append("ENABLE_LIVE must be false")
    if env.get("CHAIN_ID") != "1":
        errors.append("CHAIN_ID must be 1")

    local_rpc = urlparse(env.get("MAINNET_RPC_URL", ""))
    if local_rpc.hostname not in {"127.0.0.1", "localhost", "::1"}:
        errors.append("MAINNET_RPC_URL must point to the loopback read-only gateway")
    upstream = urlparse(env.get("READ_RPC_UPSTREAM", ""))
    if upstream.scheme != "https" or not upstream.hostname:
        errors.append("READ_RPC_UPSTREAM must be HTTPS")
    if upstream.hostname and "flashbots" in upstream.hostname.lower():
        errors.append("READ_RPC_UPSTREAM cannot be a relay")
    for key in FORBIDDEN:
        if env.get(key):
            errors.append(f"{key} must not be stored in this project")

    if errors:
        print("Configuration validation failed:", file=sys.stderr)
        for error in errors:
            print(f" - {error}", file=sys.stderr)
        return 1
    print("Configuration validation passed.")
    print(f"Aave pool: {env['AAVE_POOL_ADDRESS']}")
    print(f"RPC mode:  loopback read-only -> {env['READ_RPC_UPSTREAM']}")
    print("Live mode: disabled")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
