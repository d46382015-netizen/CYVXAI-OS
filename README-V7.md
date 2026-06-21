# Spark + CYVX v7

Spark is the public action layer. CYVX is the intelligence, coordination, governance, and learning system beneath it.

`Intention → Model → Approval → Execute → World → Lead → Outcome → Proof → Learn`

Run:

```bash
npm ci
npm run doctor
npm start
```

Verify:

```bash
npm run verify
```

Production endpoints:

- Spark: `http://127.0.0.1:3000/`
- CYVX OS: `http://127.0.0.1:3000/os`
- Control plane: `http://127.0.0.1:3004/api/control-plane`
- Metrics: `http://127.0.0.1:3004/metrics`

See [`docs/PRODUCTION_V7.md`](docs/PRODUCTION_V7.md) for the full architecture, deployment contract, bounded execution controls, and proof gates.
