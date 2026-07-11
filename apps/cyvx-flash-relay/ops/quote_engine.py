#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from dataclasses import asdict, dataclass
from decimal import Decimal, ROUND_DOWN, getcontext
from pathlib import Path
from typing import Any

getcontext().prec = 80
ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
OUTPUT_PATH = ROOT / "data" / "latest-quotes.json"
USDC_DECIMALS = 6
WETH_DECIMALS = 18
BPS = 10_000


@dataclass(frozen=True)
class Candidate:
    direction: str
    feeTier: int
    amountInUSDC: int
    firstQuotedOut: int
    secondQuotedOutUSDC: int
    firstMinOut: int
    secondMinOutUSDC: int
    aavePremiumUSDC: int
    gasCostWei: int
    gasCostUSDC: int
    expectedNetUSDC: int
    profitable: bool


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def rpc(url: str, method: str, params: list[Any]) -> Any:
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        separators=(",", ":"),
    ).encode()
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "cyvx-quote-engine/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response)
    if "error" in result:
        raise RuntimeError(f"{method}: {result['error']}")
    return result["result"]


def cast_raw(rpc_url: str, block: int, contract: str, signature: str, *args: str) -> str:
    process = subprocess.run(
        [
            "cast", "call", contract, signature, *args,
            "--rpc-url", rpc_url, "--block", str(block),
        ],
        capture_output=True,
        text=True,
    )
    if process.returncode != 0:
        raise RuntimeError(process.stderr.strip() or process.stdout.strip())
    output = process.stdout.strip().splitlines()[-1].strip()
    if not output.startswith("0x"):
        raise RuntimeError(f"unexpected cast output: {output}")
    return output


def decode_uint(raw: str) -> int:
    data = bytes.fromhex(raw.removeprefix("0x"))
    if len(data) < 32:
        raise RuntimeError("short ABI uint")
    return int.from_bytes(data[:32], "big")


def decode_uint_array(raw: str) -> list[int]:
    data = bytes.fromhex(raw.removeprefix("0x"))
    if len(data) < 64:
        raise RuntimeError("short ABI array")
    offset = int.from_bytes(data[:32], "big")
    length = int.from_bytes(data[offset : offset + 32], "big")
    start = offset + 32
    end = start + length * 32
    if end > len(data):
        raise RuntimeError("truncated ABI array")
    return [
        int.from_bytes(data[start + i * 32 : start + (i + 1) * 32], "big")
        for i in range(length)
    ]


def quote_uni(env: dict[str, str], block: int, token_in: str, token_out: str, fee: int, amount: int) -> int:
    return decode_uint(
        cast_raw(
            env["MAINNET_RPC_URL"],
            block,
            env["UNISWAP_V3_QUOTER"],
            "quoteExactInputSingle(address,address,uint24,uint256,uint160)",
            token_in,
            token_out,
            str(fee),
            str(amount),
            "0",
        )
    )


def quote_sushi(env: dict[str, str], block: int, token_in: str, token_out: str, amount: int) -> int:
    values = decode_uint_array(
        cast_raw(
            env["MAINNET_RPC_URL"],
            block,
            env["SUSHI_V2_ROUTER"],
            "getAmountsOut(uint256,address[])",
            str(amount),
            f"[{token_in},{token_out}]",
        )
    )
    if len(values) != 2 or values[0] != amount:
        raise RuntimeError(f"unexpected Sushi quote: {values}")
    return values[1]


def slippage(amount: int, bps: int) -> int:
    return amount * (BPS - bps) // BPS


def parse_usdc(value: str) -> int:
    return int(
        (Decimal(value) * (Decimal(10) ** USDC_DECIMALS)).to_integral_value(
            rounding=ROUND_DOWN
        )
    )


def format_units(value: int, decimals: int) -> str:
    return format(Decimal(value) / (Decimal(10) ** decimals), "f")


def atomic_json(payload: dict[str, Any]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix="latest-quotes.", dir=str(OUTPUT_PATH.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
        os.replace(name, OUTPUT_PATH)
    finally:
        try:
            os.unlink(name)
        except FileNotFoundError:
            pass


def main() -> int:
    env = load_env()
    if env.get("ENABLE_LIVE", "").lower() != "false":
        raise RuntimeError("ENABLE_LIVE must be false")

    url = env["MAINNET_RPC_URL"]
    chain_id = int(rpc(url, "eth_chainId", []), 16)
    if chain_id != 1:
        raise RuntimeError(f"wrong chain id: {chain_id}")
    block_number = int(rpc(url, "eth_blockNumber", []), 16)
    block = rpc(url, "eth_getBlockByNumber", [hex(block_number), False])
    gas_price = int(rpc(url, "eth_gasPrice", []), 16)
    premium_bps = decode_uint(
        cast_raw(url, block_number, env["AAVE_POOL_ADDRESS"], "FLASHLOAN_PREMIUM_TOTAL()")
    )
    if not 0 <= premium_bps <= 1000:
        raise RuntimeError(f"implausible premium: {premium_bps}")

    amounts = [parse_usdc(x.strip()) for x in env["QUOTE_AMOUNTS_USDC"].split(",") if x.strip()]
    fees = [int(x.strip()) for x in env["UNISWAP_FEE_TIERS"].split(",") if x.strip()]
    slippage_bps = int(env["QUOTE_SLIPPAGE_BPS"])
    gas_units = int(env["GAS_UNITS_ASSUMPTION"])
    gas_wei = gas_units * gas_price

    gas_quotes: list[int] = []
    for fee in fees:
        try:
            gas_quotes.append(quote_uni(env, block_number, env["WETH_ADDRESS"], env["USDC_ADDRESS"], fee, gas_wei))
        except RuntimeError:
            pass
    try:
        gas_quotes.append(quote_sushi(env, block_number, env["WETH_ADDRESS"], env["USDC_ADDRESS"], gas_wei))
    except RuntimeError:
        pass
    if not gas_quotes:
        raise RuntimeError("unable to value gas in USDC")
    gas_usdc = max(gas_quotes)

    candidates: list[Candidate] = []
    failures: list[dict[str, Any]] = []
    for amount in amounts:
        premium = amount * premium_bps // BPS
        for fee in fees:
            for direction in ("UNI_V3_TO_SUSHI_V2", "SUSHI_V2_TO_UNI_V3"):
                try:
                    if direction == "UNI_V3_TO_SUSHI_V2":
                        first = quote_uni(env, block_number, env["USDC_ADDRESS"], env["WETH_ADDRESS"], fee, amount)
                        second = quote_sushi(env, block_number, env["WETH_ADDRESS"], env["USDC_ADDRESS"], first)
                    else:
                        first = quote_sushi(env, block_number, env["USDC_ADDRESS"], env["WETH_ADDRESS"], amount)
                        second = quote_uni(env, block_number, env["WETH_ADDRESS"], env["USDC_ADDRESS"], fee, first)
                    net = second - amount - premium - gas_usdc
                    candidates.append(
                        Candidate(
                            direction=direction,
                            feeTier=fee,
                            amountInUSDC=amount,
                            firstQuotedOut=first,
                            secondQuotedOutUSDC=second,
                            firstMinOut=slippage(first, slippage_bps),
                            secondMinOutUSDC=slippage(second, slippage_bps),
                            aavePremiumUSDC=premium,
                            gasCostWei=gas_wei,
                            gasCostUSDC=gas_usdc,
                            expectedNetUSDC=net,
                            profitable=net > 0,
                        )
                    )
                except RuntimeError as exc:
                    failures.append(
                        {
                            "direction": direction,
                            "feeTier": fee,
                            "amountInUSDC": amount,
                            "error": str(exc),
                        }
                    )

    candidates.sort(key=lambda item: item.expectedNetUSDC, reverse=True)
    best = candidates[0] if candidates else None
    payload: dict[str, Any] = {
        "mode": "read-only",
        "liveEnabled": False,
        "chainId": chain_id,
        "blockNumber": block_number,
        "blockHash": block.get("hash"),
        "blockTimestamp": int(block["timestamp"], 16),
        "aavePool": env["AAVE_POOL_ADDRESS"],
        "aavePremiumBps": premium_bps,
        "gasPriceWei": gas_price,
        "gasUnitsAssumption": gas_units,
        "gasCostWei": gas_wei,
        "gasCostUSDC": gas_usdc,
        "gasCostUSDCFormatted": format_units(gas_usdc, USDC_DECIMALS),
        "slippageBps": slippage_bps,
        "candidateCount": len(candidates),
        "profitableCandidateCount": sum(x.profitable for x in candidates),
        "bestCandidate": asdict(best) if best else None,
        "candidates": [asdict(x) for x in candidates],
        "failures": failures,
    }
    if best:
        payload["bestCandidateFormatted"] = {
            "amountInUSDC": format_units(best.amountInUSDC, USDC_DECIMALS),
            "firstQuotedOut": format_units(best.firstQuotedOut, WETH_DECIMALS),
            "secondQuotedOutUSDC": format_units(best.secondQuotedOutUSDC, USDC_DECIMALS),
            "aavePremiumUSDC": format_units(best.aavePremiumUSDC, USDC_DECIMALS),
            "gasCostUSDC": format_units(best.gasCostUSDC, USDC_DECIMALS),
            "expectedNetUSDC": format_units(best.expectedNetUSDC, USDC_DECIMALS),
        }
    atomic_json(payload)

    print(f"Pinned block:       {block_number}")
    print(f"Aave premium:      {premium_bps} bps")
    print(f"Candidates quoted: {len(candidates)}")
    if best:
        print(f"Best route:         {best.direction} / fee {best.feeTier}")
        print(f"Amount:             {format_units(best.amountInUSDC, USDC_DECIMALS)} USDC")
        print(f"Expected net:       {format_units(best.expectedNetUSDC, USDC_DECIMALS)} USDC")
        print(f"Profitable:         {'yes' if best.profitable else 'no'}")
    print(f"Saved:              {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"quote engine failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
