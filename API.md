# API Reference

All JSON responses include:
- `powered_by`
- `creator`
- `version`
- `timestamp`

## Status
- `GET /status`

## Dashboard
- GET /api/v1/dashboard

## Onboard
- POST /api/v1/onboard
- Body: { companyName: Acme Robotics }


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


## Proof Surfaces
- API: /api/v1/github/repository?owner=acme&repo=cyvx
- API: /api/v1/github/health?owner=acme&repo=cyvx
- API: /api/v1/github/proof?owner=acme&repo=cyvx
- API: /api/v1/repository-health?owner=acme&repo=cyvx
- API: /api/v1/proof?owner=acme&repo=cyvx
- CLI: repository-health, repo-health, proof, github, github-health, github-proof


## Self-Scan APIs

### GET /api/v1/self-scan
Returns the CYVX local repository self-scan, including health, top constraint, observations, next-best actions, mission, and trust score.

### GET /api/v1/self-scan-mission
Runs the self-scan mission bridge and returns generated mission and next-best-action records.
