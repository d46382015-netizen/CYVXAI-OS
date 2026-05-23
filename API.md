# API Reference

All JSON responses include:
- `powered_by`
- `creator`
- `version`
- `timestamp`

## Status
- `GET /status`

## Agents
- `GET /v1/agents`

## Leaderboard
- `GET /v1/leaderboard`

## Roadmap
- `GET /v1/roadmap`

## Ask
- `POST /ask`
- Body:
```json
{ "task": "optimize:cluster" }
```

## Cluster
- `GET /api/v1/cluster`

## Workloads
- `GET /api/v1/workloads`
- `POST /api/v1/workloads`

## Actions
- `GET /api/v1/actions`
- `POST /api/v1/actions`

## Metrics
- `GET /api/v1/metrics/history`
- `GET /api/v1/status-model`
- `GET /metrics`

## Health
- `GET /healthz`
