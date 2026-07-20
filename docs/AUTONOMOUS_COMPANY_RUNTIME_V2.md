# CYVX Autonomous Company Runtime v2

CYVX Autonomous Company Runtime v2 turns a founder-supplied idea, taste, and measurable objective into a governed company operating loop with nine durable agents, an owned control room, persistent scheduling, model-backed reasoning, signed outside-world integrations, evidence, metrics, learning, and improvement work.

It extends the existing CYVX Autonomous Company Operator instead of creating a disconnected agent demo.

## Production architecture

```text
Founder / owner
  → mobile control room
  → authenticated company-runtime API
  → CYVX outcome contract and mission approval
  → durable SQLite task scheduler with leases, retries, dependencies, and idempotency
  → nine role agents
       CEO
       Research
       Engineering
       Marketing
       Outreach
       Growth
       Support
       Finance
       Operations
  → model provider
       deterministic policy/rules engine
       Anthropic API
       Claude Code CLI
  → durable company memory, metrics, learnings, artifacts, and event ledger
  → least-privilege HMAC-signed HTTPS integrations
  → measured outcome
  → next improvement task
```

The runtime uses the existing CYVX mission database and Company Operator workspace. It does not introduce Redis, Docker, systemd, or a second external database, so it remains deployable from UserLAnd or a normal Linux host.

## Real capabilities

### Backend

- authenticated HTTP control API;
- organization-scoped company runtimes;
- reuse of the existing CYVX Company Operator, outcome contracts, mission lifecycle, evidence, budgets, approvals, leads, and learned capabilities;
- nine persisted role agents;
- dependency-aware durable tasks;
- task leases and expired-lease recovery;
- bounded retries with exponential backoff;
- structured model output validation;
- deterministic artifact generation and SHA-256 proof;
- durable memory, metric, learning, delivery, and event ledgers;
- public rate-limited lead intake;
- least-privilege external webhook registry;
- allowlisted event types;
- environment-only secrets;
- HMAC SHA-256 signatures;
- idempotent delivery keys;
- request timeouts and persisted delivery responses.

### Mobile control room

The control room can:

- create a real governed company mission;
- approve its outcome contract;
- run one tick or run to idle;
- see all nine agents and their completed/failed work;
- inspect the task ledger and artifact proof hashes;
- record measured outcomes and learnings;
- create the next growth improvement task automatically;
- register production webhook integrations without storing secrets in the database;
- inspect the event stream and current commercial scoreboard.

### Model providers

`rules` is the zero-key production baseline. It is deterministic operating logic, not a fake model response. It creates concrete company strategy, research, engineering, marketing, outreach, growth, support, finance, and operations artifacts while preserving the truth boundary between generated plans and verified external outcomes.

`anthropic` uses the repository's installed `@anthropic-ai/sdk` dependency and requires `ANTHROPIC_API_KEY`.

`claude-cli` invokes a local Claude CLI process and requires the `claude` command or `CYVX_CLAUDE_COMMAND`.

Every provider must return the same validated JSON contract:

```json
{
  "summary": "...",
  "decisions": ["..."],
  "actions": ["..."],
  "risks": ["..."],
  "evidence_required": ["..."],
  "metrics": [{ "name": "...", "target": "...", "source": "..." }]
}
```

A model cannot directly send messages, spend money, transfer funds, sign contracts, publish ads, or mutate provider accounts. Outside-world execution occurs only through a registered integration with an allowlisted event type, environment-backed secret, explicit dispatch call, idempotency key, signature, timeout, and delivery record.

## Storage

The runtime adds these tables to the existing mission SQLite database:

```text
acr_teams
acr_agents
acr_tasks
acr_memories
acr_metrics
acr_learnings
acr_integrations
acr_deliveries
acr_events
```

Agent artifacts are written under the owned Company Operator workspace:

```text
~/.cyvx/companies/<organization>/<company>/company-runtime/
├── ceo/strategy.operating_plan.json
├── research/research.evidence_brief.json
├── engineering/engineering.delivery_plan.json
├── marketing/marketing.demand_system.json
├── outreach/outreach.pipeline_playbook.json
├── growth/growth.experiment_portfolio.json
├── support/support.service_system.json
├── finance/finance.unit_economics.json
└── operations/operations.company_runbook.json
```

Each artifact contains its company, outcome contract, agent, generated output, timestamp, and an explicit truth boundary. The task ledger stores the absolute artifact path and SHA-256 digest.

## Run

Zero-key, mobile-compatible baseline:

```bash
cd ~/CYVXAI-OS && \
npm run company:runtime
```

Open:

```text
http://127.0.0.1:3030/control-room
```

The development startup event prints the generated local bearer token. The control room also receives that token during local development.

Anthropic:

```bash
cd ~/CYVXAI-OS && \
ANTHROPIC_API_KEY='your-key' \
CYVX_COMPANY_MODEL_PROVIDER=anthropic \
npm run company:runtime
```

Claude CLI:

```bash
cd ~/CYVXAI-OS && \
CYVX_COMPANY_MODEL_PROVIDER=claude-cli \
npm run company:runtime
```

Production:

```bash
cd ~/CYVXAI-OS && \
NODE_ENV=production \
CYVX_COMPANY_RUNTIME_HOST=0.0.0.0 \
CYVX_COMPANY_RUNTIME_TOKEN="$(node -e 'console.log(require("node:crypto").randomBytes(48).toString("base64url"))')" \
CYVX_COMPANY_MODEL_PROVIDER=rules \
npm run company:runtime
```

Terminate TLS at the existing public gateway or a trusted reverse proxy. Do not expose the runtime directly without HTTPS.

## API

Public:

```text
GET  /healthz
GET  /control-room
POST /api/v1/company-runtime/companies/:companyId/leads
```

Bearer-authenticated:

```text
GET  /api/v1/company-runtime/companies
POST /api/v1/company-runtime/companies
GET  /api/v1/company-runtime/companies/:companyId
POST /api/v1/company-runtime/companies/:companyId/approve
POST /api/v1/company-runtime/companies/:companyId/tick
POST /api/v1/company-runtime/companies/:companyId/run
POST /api/v1/company-runtime/companies/:companyId/tasks
POST /api/v1/company-runtime/companies/:companyId/outcomes
GET  /api/v1/company-runtime/companies/:companyId/integrations
POST /api/v1/company-runtime/companies/:companyId/integrations
POST /api/v1/company-runtime/companies/:companyId/integrations/:integrationId/dispatch
```

## Outside-world integration contract

Registration stores the environment variable name, never the secret itself:

```json
{
  "name": "crm-production",
  "kind": "webhook",
  "url": "https://crm.example.com/cyvx/events",
  "secret_env": "CYVX_CRM_WEBHOOK_SECRET",
  "allowed_event_types": ["lead.qualified", "outcome.recorded"],
  "timeout_ms": 15000
}
```

Dispatch sends:

```text
Content-Type: application/json
X-CYVX-Event: lead.qualified
X-CYVX-Signature: sha256=<HMAC_SHA256>
Idempotency-Key: <caller supplied key>
```

The delivery record persists request digest, response status, bounded response body, error, and completion time. Reusing the same integration and idempotency key returns the existing record without a second external call.

## Measure → learn → improve

Recording an outcome requires:

- metric name, value, unit, and source;
- observed result;
- explicit learning;
- next hypothesis;
- optional evidence metadata.

The runtime persists the metric and learning, adds them to durable memory, reactivates the team, and queues a high-priority Growth improvement task. This closes the production loop:

```text
Input → Model → Execute → Measure → Learn → Improve
```

## Verify

```bash
cd ~/CYVXAI-OS && \
npm run company:runtime:verify
```

The focused verification proves:

- syntax validity;
- creation of a governed CYVX company mission;
- nine persisted role agents;
- owner approval boundary;
- Company Operator activation;
- dependency-aware task execution;
- durable artifacts and SHA-256 proof;
- durable memory;
- measured learning and automatically queued improvement work;
- authenticated control API;
- public rate-limited lead capture;
- allowlisted outside-world events;
- HMAC signature verification;
- idempotent webhook delivery.

Proof is written to:

```text
artifacts/autonomous-company-runtime/verification.json
```

## Truth boundary

The runtime proves that CYVX can create, schedule, execute, persist, validate, measure, and learn from governed company work. Generated strategy and agent artifacts are not proof that an ad ran, a prospect was contacted, a payment cleared, a contract was signed, a deployment succeeded, or revenue was collected. Those claims require provider, payment, deployment, customer, or reconciliation evidence stored through a connected production capability.
