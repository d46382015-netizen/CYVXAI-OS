#!/usr/bin/env python3
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "dashboard" / "index.html"
EVENTS = ROOT / "data" / "events.jsonl"
QUOTES = ROOT / "data" / "latest-quotes.json"
FORK = ROOT / "data" / "latest-fork-simulation.json"
RPC_SELECTION = ROOT / "data" / "rpc-selection.json"


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    path = ROOT / ".env"
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def read_json(path: Path) -> Any:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def read_events(limit: int = 100) -> list[dict[str, Any]]:
    if not EVENTS.exists():
        return []
    events: list[dict[str, Any]] = []
    for row in EVENTS.read_text(encoding="utf-8").splitlines()[-limit:]:
        try:
            events.append(json.loads(row))
        except json.JSONDecodeError:
            continue
    return list(reversed(events))


class Handler(BaseHTTPRequestHandler):
    def send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/api/status":
            env = load_env()
            latest = read_events(1)
            self.send_json(
                {
                    "service": "CYVX Flash Relay",
                    "mode": "read-only/fork-only",
                    "liveEnabled": env.get("ENABLE_LIVE", "").lower() == "true",
                    "chainId": env.get("CHAIN_ID", ""),
                    "owner": env.get("OWNER_ADDRESS", ""),
                    "operator": env.get("OPERATOR_ADDRESS", ""),
                    "aavePool": env.get("AAVE_POOL_ADDRESS", ""),
                    "localRpc": env.get("MAINNET_RPC_URL", ""),
                    "rpcConfigured": bool(env.get("READ_RPC_UPSTREAM")),
                    "latestEvent": latest[0] if latest else None,
                    "rpcSelection": read_json(RPC_SELECTION),
                }
            )
            return
        if self.path == "/api/events":
            self.send_json(read_events())
            return
        if self.path == "/api/quotes":
            self.send_json(read_json(QUOTES) or {})
            return
        if self.path == "/api/fork":
            self.send_json(read_json(FORK) or {})
            return
        if self.path in {"/", "/index.html"}:
            body = INDEX.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_json({"error": "not found"}, 404)

    def log_message(self, fmt: str, *args: object) -> None:
        return


def main() -> None:
    env = load_env()
    host = env.get("DASHBOARD_HOST", "127.0.0.1")
    port = int(env.get("DASHBOARD_PORT", "8789"))
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Dashboard must bind to loopback")
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"CYVX Flash Relay dashboard: http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
