#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

UPSTREAM = os.environ.get("READ_RPC_UPSTREAM", "").rstrip("/")
HOST = os.environ.get("READ_RPC_HOST", "127.0.0.1")
PORT = int(os.environ.get("READ_RPC_PORT", "18545"))
MAX_BODY = 5 * 1024 * 1024

DENIED_EXACT = {
    "eth_sendTransaction",
    "eth_sendRawTransaction",
    "eth_sign",
    "eth_signTransaction",
    "eth_signTypedData",
    "eth_signTypedData_v1",
    "eth_signTypedData_v3",
    "eth_signTypedData_v4",
    "eth_submitHashrate",
    "eth_submitWork",
    "eth_sendBundle",
    "eth_sendPrivateTransaction",
    "eth_sendPrivateRawTransaction",
    "mev_sendBundle",
    "eth_cancelBundle",
    "eth_cancelPrivateTransaction",
}
DENIED_PREFIXES = (
    "personal_",
    "wallet_",
    "admin_",
    "miner_",
    "engine_",
    "txpool_",
    "debug_",
    "trace_",
    "anvil_",
    "hardhat_",
    "evm_",
    "flashbots_",
    "mev_",
)


def method_blocked(method: object) -> bool:
    if not isinstance(method, str) or not method:
        return True
    return method in DENIED_EXACT or method.startswith(DENIED_PREFIXES)


def error_response(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def forward(payload: dict[str, Any]) -> dict[str, Any]:
    method = payload.get("method")
    request_id = payload.get("id")
    if method_blocked(method):
        return error_response(request_id, -32001, f"RPC method blocked by read-only policy: {method}")

    body = json.dumps(payload, separators=(",", ":")).encode()
    request = urllib.request.Request(
        UPSTREAM,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "cyvx-readonly-rpc/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            upstream_result = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read(4096).decode(errors="replace")
        return error_response(request_id, -32002, f"upstream HTTP {exc.code}: {detail}")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        return error_response(request_id, -32002, f"upstream unavailable: {exc}")

    if isinstance(upstream_result, dict):
        return upstream_result
    return error_response(request_id, -32603, "invalid upstream response")


class Handler(BaseHTTPRequestHandler):
    server_version = "CYVXReadOnlyRPC/1.0"

    def _write_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-CYVX-RPC-Mode", "read-only")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._write_json({"ok": True, "mode": "read-only", "upstreamConfigured": bool(UPSTREAM)})
            return
        self._write_json({"error": "not found"}, 404)

    def do_POST(self) -> None:
        if not UPSTREAM.startswith("https://"):
            self._write_json(error_response(None, -32003, "HTTPS upstream is not configured"), 503)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._write_json(error_response(None, -32600, "invalid Content-Length"), 400)
            return
        if length <= 0 or length > MAX_BODY:
            self._write_json(error_response(None, -32600, "invalid request size"), 400)
            return
        try:
            payload = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            self._write_json(error_response(None, -32700, "parse error"), 400)
            return

        if isinstance(payload, list):
            if not payload:
                self._write_json(error_response(None, -32600, "empty batch"), 400)
                return
            result = [
                forward(item) if isinstance(item, dict) else error_response(None, -32600, "invalid request")
                for item in payload
            ]
            self._write_json(result)
            return
        if not isinstance(payload, dict):
            self._write_json(error_response(None, -32600, "invalid request"), 400)
            return
        self._write_json(forward(payload))

    def log_message(self, fmt: str, *args: object) -> None:
        return


def main() -> None:
    if HOST not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("READ_RPC_HOST must be loopback")
    if not UPSTREAM.startswith("https://"):
        raise SystemExit("READ_RPC_UPSTREAM must be an HTTPS URL")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"CYVX read-only RPC listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
