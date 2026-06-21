# Spark + CYVX v7 Production System

CYVX v7 turns the repository’s existing intelligence, Spark, World, mission, approval, proof, and outcome primitives into one production runtime.

## Operating loop

`Intention → Model → Approval → Bounded Execution → World → Lead → Outcome → Proof → Learning`

The public experience remains simple. The backend coordinates the CYVX API, Spark runtime, durable World assets, GitHub control plane, approved execution supervisor, readiness model, metrics, and next-action intelligence.

## Runtime topology

| Service | Default | Exposure |
|---|---:|---|
| Public Spark + CYVX gateway | `3000` | Public |
| CYVX production gateway | `3001` | Loopback |
| CYVX internal API | `3002` | Loopback |
| Spark runtime | `3003` | Loopback |
| v7 control plane | `3004` | Loopback |

The control plane provides:

- `GET /healthz`
- `GET /readyz`
- `GET /api/control-plane`
- `GET /api/overview`
- `GET /metrics`

## Bounded autonomy

The supervisor only executes a Spark when all of these are true:

1. the Spark is active;
2. an owner-approved scope exists;
3. the mission is active;
4. the execution stays inside the existing Spark capability and budget model.

Set `CYVX_AUTONOMY=0` to disable scheduled execution. Use `CYVX_AUTONOMY_INTERVAL_MS` and `CYVX_AUTONOMY_MAX_PER_TICK` to bound cadence and throughput.

## Run

```bash
npm ci
cp .env.example .env
npm run doctor
npm start
```

Public product: `http://127.0.0.1:3000/`

Operator OS: `http://127.0.0.1:3000/os`

Control plane: `http://127.0.0.1:3004/api/control-plane`

## Verify

```bash
npm run verify
curl -fsS http://127.0.0.1:3000/readyz
curl -fsS http://127.0.0.1:3004/readyz
curl -fsS http://127.0.0.1:3004/api/control-plane
curl -fsS http://127.0.0.1:3004/metrics
```

`npm run verify` performs environment diagnostics, the complete test suite, CommonJS syntax validation, browser-module syntax validation, UI contract tests, and a distributable build.

## Proof gate

`.github/workflows/cyvx-v7.yml` proves the production loop on Node 22 and Node 24. The smoke job creates a real persisted Spark, approves its bounded mission, waits for scheduled execution, verifies an operational World and proof records, captures a lead, and validates the control-plane metrics.
