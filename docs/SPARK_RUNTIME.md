# Spark Runtime v1

Spark Runtime converts an intention into a durable World with ownership, an offer, a generated website, persisted lead intake, queued follow-up work, evidence, outcomes, and portable export.

## Run

```bash
npm run spark
```

Open `http://127.0.0.1:3100`.

## Verify

```bash
npm run spark:verify
npm run verify
```

## Storage

- Runtime state: `.cyvx/spark-state.json`
- World assets: `.cyvx/worlds/<world-id>/`
- Structured logs: `.cyvx/logs/spark-runtime.log`

## Lifecycle

Intention → ownership → mission → approval → execution → operational World → evidence → outcome → learning.

The owner can pause, resume, end, configure, and export a World. Execution remains bounded to the approved capability scope.

## Main routes

- `POST /api/v1/sparks`
- `GET /api/v1/sparks/:id`
- `POST /api/v1/sparks/:id/approval`
- `POST /api/v1/sparks/:id/execute`
- `POST /api/v1/sparks/:id/control`
- `POST /api/v1/sparks/:id/outcomes`
- `PATCH /api/v1/worlds/:id`
- `POST /api/v1/worlds/:id/leads`
- `GET /api/v1/worlds/:id/export`
- `GET /w/:slug`
- `GET /metrics`

Generated artifacts receive SHA-256 evidence. Outcome value is counted as verified only when provenance is supplied.
