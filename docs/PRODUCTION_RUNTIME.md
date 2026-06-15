# CYVX Production Runtime

`npm start` is the production entrypoint. It launches two connected processes and supervises their lifecycle as one command.

## Topology

- Public gateway: `CYVX_PORT` (default `3000`)
- Existing loopback API: `CYVX_INTERNAL_PORT` (default `3001`)
- Operations sidecar: `127.0.0.1:CYVX_OPS_PORT` (default `3002`)

The public gateway keeps all existing CYVX, GitHub App, operator-session, API-key, WebSocket, and UI behavior. The operations sidecar is loopback-only and never receives credentials, request bodies, webhook payloads, or user data.

## Operations endpoints

- `GET /healthz` — sidecar liveness
- `GET /livez` — sidecar liveness alias
- `GET /readyz` — sidecar readiness
- `GET /api/runtime/status` — uptime, request totals, failures, in-flight requests, latency, Node version, platform, and architecture
- `GET /api/runtime/metrics` — Prometheus text metrics for operations traffic

The operations request counters measure health, readiness, status, and metrics traffic to the sidecar. Application and GitHub control-plane state remain available through the existing public APIs.

## Controls

- `CYVX_GATEWAY_RATE_LIMIT` — fixed-window limiter capacity for reusable runtime consumers
- `CYVX_OPS_PORT` — loopback operations port
- `CYVX_LOG_LEVEL` — reserved runtime log level
- `CYVX_PORT` — public gateway port
- `CYVX_INTERNAL_PORT` — loopback application port

## Run

```bash
npm ci
npm start
```

## Verify

```bash
npm run verify
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3002/readyz
curl -fsS http://127.0.0.1:3002/api/runtime/status
curl -fsS http://127.0.0.1:3002/api/runtime/metrics
```

`npm run verify` checks production syntax, executes runtime assertions, runs the complete Node test suite, and builds distributable artifacts.

## Release gate

CI validates Node 22 and Node 24, then starts the real production command and verifies:

1. public gateway health and authenticated core routes;
2. loopback operations readiness, status, and metrics;
3. Spark creation, approval, execution, lead capture, and measured output.

No schema migration is required.
