# CYVX Company Control Plane v1

CYVX Company Control Plane extends the existing mission, universal-entity, revenue, bid-sprint, governance, and evidence runtimes with one durable company-operating control surface.

It does not treat generated files, checkouts, deployments, leads, customers, or revenue as interchangeable truth. State advances only through explicit transitions and retained evidence.

## Production loop

```text
Owner mission
→ Compile bounded operating contract
→ Observe reality
→ Diagnose constraints
→ Prioritize next action
→ Plan
→ Approve
→ Execute idempotent effect
→ Verify evidence and deployment
→ Measure outcome and SLO
→ Learn from prediction error
→ Replan
```

## Implemented capabilities

- owner-mission compiler backed by the existing operator entity and outcome contract;
- evidence-gated company truth states from idea through scalable operation;
- decision and hypothesis ledger with alternatives, confidence, actual outcome, and prediction error;
- bounded experiments with budget ceilings, sample thresholds, observations, evidence, and deterministic evaluation;
- explainable next-best-action ranking over the governed action registry;
- restart-safe operating cycles with strict phase ordering;
- action registry with capability, risk, approval, cost, evidence, and compensation contracts;
- organization-scoped idempotency/effect ledger;
- saga steps and reverse-order compensation state;
- provider readiness records that persist secret names and readiness, never values;
- deployed-commit registry with real HTTP health verification, service identity, and commit matching;
- deduplicated operator notifications and acknowledgment;
- usage/value metering tied to evidence when supplied;
- SLO definitions, observations, and breach notifications;
- versioned vertical-operator packs with SHA-256 manifests;
- live evidence-chain verification and complete company snapshots;
- mobile-first owner cockpit and authenticated v5 API.

## Storage

The control plane reuses the organization-scoped mission-runtime SQLite database and creates:

```text
company_mission_compilations
company_truth_transitions
company_decisions
company_experiments
company_experiment_observations
company_operating_cycles
company_action_registry
company_effects
company_sagas
company_saga_steps
company_providers
company_deployments
company_notifications
company_usage_events
company_slos
company_slo_observations
company_vertical_packs
```

Every query and mutation is scoped by `organization_id` and the authenticated entity owner boundary.

## Run

```bash
cd ~/CYVXAI-OS && \
CYVX_ALLOW_INSECURE_LOCAL=true npm run operator
```

Open:

```text
Universal operator: http://127.0.0.1:3020/operator
Company control:   http://127.0.0.1:3021/company-control
Mission runtime:   http://127.0.0.1:3000/missions
```

Ports are configurable with:

```text
CYVX_OPERATOR_PORT
CYVX_COMPANY_CONTROL_PORT
CYVX_MISSION_PORT
```

Production requires the existing bearer-token identity boundary, TLS/reverse proxy, and `CYVX_OPERATOR_CORS_ALLOWLIST`.

## API

Health and UI:

```text
GET /company-control
GET /api/v5/company-control/health
```

Authenticated company operations:

```text
GET  /api/v5/company-control/entities/:id
POST /api/v5/company-control/entities/:id/compile
POST /api/v5/company-control/entities/:id/truth
POST /api/v5/company-control/entities/:id/decisions
POST /api/v5/company-control/decisions/:id/resolve
POST /api/v5/company-control/entities/:id/experiments
POST /api/v5/company-control/experiments/:id/observations
POST /api/v5/company-control/experiments/:id/evaluate
GET  /api/v5/company-control/entities/:id/next-actions
POST /api/v5/company-control/entities/:id/cycles
POST /api/v5/company-control/cycles/:id/advance
POST /api/v5/company-control/entities/:id/effects
POST /api/v5/company-control/effects/:id/settle
POST /api/v5/company-control/entities/:id/sagas
POST /api/v5/company-control/sagas/:id/steps
POST /api/v5/company-control/sagas/:id/compensate
GET  /api/v5/company-control/providers
POST /api/v5/company-control/providers
POST /api/v5/company-control/entities/:id/deployments
POST /api/v5/company-control/deployments/:id/verify
GET  /api/v5/company-control/notifications
POST /api/v5/company-control/notifications
POST /api/v5/company-control/notifications/:id/ack
POST /api/v5/company-control/entities/:id/usage
POST /api/v5/company-control/entities/:id/slos
POST /api/v5/company-control/slos/:id/observations
POST /api/v5/company-control/entities/:id/vertical-packs
GET  /api/v5/company-control/entities/:id/evidence
```

## Deployment proof

A deployment record is not proof. `POST /deployments/:id/verify` performs a real HTTP request to the stored health URL and records:

- HTTP status;
- parsed health payload or content digest;
- expected and observed service identity;
- expected and observed commit/version;
- verification timestamp;
- failure reason;
- resulting `proven` or `degraded` state.

A failed proof creates a critical deduplicated notification.

## Provider contract

A provider declares supported actions and required environment-variable names. Readiness is calculated from the current runtime environment. Secret values are never returned or persisted.

Provider records do not create provider accounts, credentials, domains, or inventory. External capabilities become operational only after the corresponding account-side configuration and least-privilege credentials exist.

## Verify

Focused proof:

```bash
cd ~/CYVXAI-OS && \
node --check services/operator/company-control-plane.js && \
node --check services/operator/company-control-server.js && \
node --check services/operator/company-control-http.js && \
node --check scripts/start-company-operator.js && \
node --test test/company-control-plane.test.js
```

Full production boundary:

```bash
cd ~/CYVXAI-OS && \
npm ci --no-audit --no-fund && \
npm run verify:production-baseline
```

The focused tests prove:

- mission compilation;
- evidence-required truth transitions;
- decision prediction-error calculation;
- experiment budget and sample enforcement;
- strict operating-cycle sequencing;
- deterministic idempotency conflict handling;
- saga compensation;
- provider readiness without secret disclosure;
- deployed-service verification behavior;
- SLO breach notification;
- evidence-backed usage metering;
- vertical-pack digest integrity;
- complete company snapshot and evidence-chain validity.

## Authority boundary

This control plane governs and proves capabilities. It does not silently create credentials, spend money, send outreach, sign contracts, submit bids, move funds, or mutate production infrastructure. Each external effect still requires its registered adapter, credentials, cost policy, idempotency key, evidence contract, compensation behavior, and applicable approval.
