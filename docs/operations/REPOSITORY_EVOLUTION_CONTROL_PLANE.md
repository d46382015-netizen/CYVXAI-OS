# CYVX Repository Evolution Control Plane

## Mission

Turn the repository itself into an observed, measurable, governed production system. The control plane inventories the live repository, evaluates it against a versioned contract, persists proof, exposes operational metrics, and converts verified gaps into a ranked evolution mission.

## Operating loop

```text
Repository reality
→ canonical production contract
→ capability inventory
→ drift and risk checks
→ weighted readiness model
→ next-best upgrade queue
→ persisted evidence
→ CI comparison
→ measured learning
```

This does not manufacture readiness. Missing core paths, commands, unsafe workflow triggers, and incompatible runtime contracts remain visible. Warnings lower the score without blocking local inspection; critical findings fail the verification command.

## Connected capability

- Backend: zero-dependency Node.js repository scanner and HTTP service
- UI: mobile-first repository evolution dashboard
- Storage: atomic latest JSON/Markdown proof plus append-only JSONL history
- Automation: pull-request, main-branch, scheduled, and manual GitHub Actions verification
- Validation: versioned `config/repository-contract.json`
- Logging: redacted JSONL operational events
- Tests: scoring, drift detection, persistence, API, metrics, and governed mutation coverage
- Metrics: Prometheus readiness, dimension, warning, failure, and critical gauges
- Proof: SHA-256 digest over every persisted snapshot

## Commands

```bash
npm run repo:intelligence
npm run repo:intelligence:verify
npm run repo:intelligence:serve
```

Dashboard:

```text
http://127.0.0.1:3014/repo-intelligence
```

Evidence defaults to:

```text
~/.cyvx/repository-intelligence/latest.json
~/.cyvx/repository-intelligence/latest.md
~/.cyvx/repository-intelligence/history.jsonl
~/.cyvx/repository-intelligence/repository-intelligence.jsonl
```

Override the storage location with `CYVX_REPOSITORY_INTELLIGENCE_ROOT`.

## Production binding

Loopback operation is available without a token when `CYVX_ALLOW_INSECURE_LOCAL=true`. Any non-loopback bind requires `CYVX_REPOSITORY_INTELLIGENCE_TOKEN`. Remote scans require the token in `Authorization: Bearer ...` or `x-cyvx-token`.

```bash
CYVX_REPOSITORY_INTELLIGENCE_HOST=0.0.0.0 \
CYVX_REPOSITORY_INTELLIGENCE_TOKEN='use-a-long-random-secret' \
npm run repo:intelligence:serve
```

## API

```text
GET  /healthz
GET  /readyz
GET  /api/v1/repository-intelligence
GET  /api/v1/repository-intelligence/history?limit=30
POST /api/v1/repository-intelligence/scan
GET  /metrics
GET  /repo-intelligence
```

## Contract evolution

The repository contract is deliberately explicit. Add a path or script only when it is a real production dependency. Add a capability when its runtime, verification, evidence, and operating command exist. Do not inflate the score by lowering thresholds to match a regression.

## Verification boundary

`npm run repo:intelligence:verify` requires:

- zero critical findings
- readiness score of at least 70
- a valid SHA-256 proof digest
- atomic JSON and Markdown evidence
- repeated scan history
- latest snapshot consistency

The production-baseline verifier runs this gate so repository drift becomes part of release readiness rather than a forgotten document.
