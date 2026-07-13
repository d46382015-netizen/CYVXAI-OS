# CYVX Autonomous Company Operator v1

CYVX Autonomous Company Operator converts a bounded business objective into an owned, governed, measurable operating capability.

It does not declare success because an agent generated files. It creates an outcome contract, activates approved company infrastructure, persists every action, records tamper-evident evidence, enforces budget and capability limits, captures real leads, measures economics, and learns a reusable capability through the existing CYVX mission lifecycle.

## Operating loop

```text
Reality
  → Outcome Contract
  → Mission Validation
  → Owner Approval
  → Durable Action Portfolio
  → Governed Execution
  → Evidence
  → Economic Measurement
  → Outcome Evaluation
  → Capability Learning
```

The initial production slice activates six connected primitives:

1. Owner-controlled company profile.
2. Measurable commercial offer.
3. Connected Minnesota opportunity-intelligence scan when available.
4. Owned conversion page.
5. Persistent lead-capture endpoint.
6. Economic scoreboard baseline.

## Production boundaries

Every operated company has:

- an organization-scoped CYVX mission;
- an explicit outcome contract;
- a maximum budget;
- an approval threshold;
- an allowed-capability list;
- a prohibited-action list;
- required evidence types;
- stop conditions;
- a persistent action portfolio;
- a tamper-evident evidence chain;
- a durable metric and lead ledger;
- audit records and structured logs;
- owner-controlled files under the configured company workspace.

The default operator cannot send messages, purchase anything, submit bids, sign contracts, or transfer funds. Those actions remain prohibited until a separately implemented capability, policy, credential scope, and approval path exist.

## Architecture

The operator reuses the production CYVX runtime rather than creating an isolated demo:

- `core/missions/mission_engine.js` — lifecycle, approvals, outcomes, and capability learning.
- `runtime/missions/` — SQLite WAL state, authenticated APIs, worker recovery, logs, and audits.
- `runtime/missions/evidence.js` — artifact hashing and evidence-chain verification.
- `services/operator/index.js` — outcome contracts, company state, action policy, execution, metrics, and leads.
- `services/operator/server.js` — operator API, public company pages, CORS, validation, body limits, and lead rate limiting.
- `ui/operator.html` — mobile-first owner control surface.
- `scripts/start-company-operator.js` — one-command mission runtime, worker, operator server, and autonomous scheduler.

## Storage

Default data root:

```text
~/.cyvx/
```

Runtime database:

```text
~/.cyvx/mission-runtime.db
```

Owned company assets:

```text
~/.cyvx/companies/<organization-id>/<company-id>/
├── company.json
├── lead-capture.json
├── assets/
│   └── offer.md
├── intelligence/
│   └── opportunities.json
├── metrics/
│   └── baseline.json
└── public/
    └── index.html
```

Operational log:

```text
~/.cyvx/logs/mission-runtime.jsonl
```

Operator state is persisted in the same SQLite database through:

- `operator_companies`
- `operator_contracts`
- `operator_actions`
- `operator_action_approvals`
- `operator_metrics`
- `operator_leads`
- `operator_ticks`

## Run

Development or UserLAnd:

```bash
cd ~/CYVXAI-OS && \
CYVX_ALLOW_INSECURE_LOCAL=true npm run operator
```

Open:

```text
http://127.0.0.1:3020/operator
```

Mission runtime:

```text
http://127.0.0.1:3000/missions
```

Production:

```bash
cd ~/CYVXAI-OS && \
export NODE_ENV=production && \
export CYVX_AUTH_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(48).toString("base64url"))')" && \
export CYVX_CORS_ALLOWLIST="https://operator.example.com" && \
export CYVX_OPERATOR_CORS_ALLOWLIST="https://operator.example.com" && \
npm run operator
```

Place the runtime behind TLS and an authenticated reverse proxy. Production local token issuance is disabled.

## Environment

| Variable | Default | Purpose |
|---|---:|---|
| `CYVX_OPERATOR_HOST` | `127.0.0.1` | Operator HTTP bind host |
| `CYVX_OPERATOR_PORT` | `3020` | Operator HTTP port |
| `CYVX_MISSION_HOST` | `127.0.0.1` | Mission runtime bind host |
| `CYVX_MISSION_PORT` | `3000` | Mission runtime port |
| `CYVX_OPERATOR_AUTO_TICK` | `true` | Run the governed company scheduler |
| `CYVX_OPERATOR_TICK_INTERVAL_MS` | `15000` | Scheduler interval |
| `CYVX_OPERATOR_BODY_LIMIT` | `262144` | Authenticated request size limit |
| `CYVX_OPERATOR_LEAD_BODY_LIMIT` | `32768` | Public lead request size limit |
| `CYVX_OPERATOR_LEAD_RATE_LIMIT` | `10` | Public lead requests per minute per peer/company |
| `CYVX_OPERATOR_CORS_ALLOWLIST` | empty | Production operator UI/API origins |
| `CYVX_COMPANY_ROOT` | `~/.cyvx/companies` | Owned company asset root |
| `CYVX_MN_STATE_FILE` | Minnesota vertical default | Connected opportunity-intelligence state |
| `CYVX_DATA_ROOT` | `~/.cyvx` | Shared runtime data root |

## API

Public:

- `GET /healthz`
- `GET /readyz`
- `GET /c/:slug`
- `POST /api/v1/operator/companies/:id/leads`

Authenticated:

- `GET /api/v1/operator/companies`
- `POST /api/v1/operator/companies`
- `GET /api/v1/operator/companies/:id`
- `POST /api/v1/operator/companies/:id/approve`
- `POST /api/v1/operator/companies/:id/tick`
- `POST /api/v1/operator/companies/:id/run`
- `POST /api/v1/operator/companies/:id/control`
- `POST /api/v1/operator/companies/:id/metrics`
- `GET /api/v1/operator/companies/:id/leads`
- `POST /api/v1/operator/actions/:id/approval`
- `POST /api/v1/operator/tick`
- `GET /api/v1/operator/export`

Local development only:

- `POST /api/v1/operator/auth/token`

## Example company contract

```json
{
  "name": "CYVX Bid & Revenue Sprint",
  "description": "Evidence-backed contract opportunity and proposal infrastructure.",
  "target_customer": "Minnesota service businesses",
  "offer": "Find, qualify, and convert high-fit contract opportunities.",
  "price_cents": 150000,
  "location": "Minnesota",
  "keywords": ["facilities", "janitorial", "landscaping", "proposal"],
  "outcome_contract": {
    "objective": "Generate the first qualified lead",
    "target_metric": "lead_count",
    "comparator": ">=",
    "target_value": 1,
    "target_unit": "count",
    "max_budget_cents": 0,
    "approval_threshold_cents": 0,
    "risk_level": "medium"
  }
}
```

Creation produces a mission in `awaiting_approval`. No action executes until an owner or approver authorizes the contract.

## Verification

```bash
cd ~/CYVXAI-OS && \
npm run operator:verify
```

The focused suite proves:

- contract validation;
- mission creation, validation, planning, and approval;
- persistent operator state;
- full six-action activation;
- owner-controlled artifacts;
- evidence-chain verification;
- budget stop behavior;
- action-level approval enforcement;
- persistent public lead capture;
- target achievement;
- completed mission evaluation and learned capability;
- authenticated HTTP control and public landing-page behavior.

Full repository verification:

```bash
cd ~/CYVXAI-OS && \
npm test && npm run build
```

## Current scope and explicit nonclaims

Version 1 is a production-capable bounded company activation operator. It does not claim universal autonomous business operation.

Implemented:

- governed company creation;
- owned offer and conversion assets;
- opportunity-intelligence ingestion;
- public lead capture;
- economic metrics;
- budget and capability enforcement;
- human approval boundaries;
- durable evidence and learning.

Not yet implemented:

- autonomous paid advertising;
- outbound email, SMS, or social posting;
- payment processing;
- contract signing;
- bid submission;
- customer fulfillment adapters;
- accounting or tax filing;
- unrestricted browser or shell execution;
- unsupervised spending.

Each additional power must enter CYVX as a separately tested capability with least-privilege credentials, idempotency, evidence requirements, cost policy, rollback, and explicit approval rules.