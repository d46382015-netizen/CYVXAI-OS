# CYVX Operations

## Stable Interfaces
- `GET /status`
- `GET /v1/agents`
- `GET /v1/leaderboard`
- `GET /v1/roadmap`
- `GET /api/v1/overview`
- `GET /api/v1/insights`
- `GET /api/v1/control-plane`
- `GET /api/v1/recovery?symptom=api_latency_p95`
- `POST /api/v1/simulate/failure`
- `POST /ask`

## Recovery Model
- Snapshots are compact and replay-safe.
- Failure drills remain non-destructive unless explicitly requested.
- WAL and audit trails are treated as append-only history.

## Local Cluster Demo
```bash
npm run demo:cluster
```

## Health Check
```bash
npm run health:cluster
```

