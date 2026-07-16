# CYVXAI-OS

**Production version: 8.3.0**  
**Created and owned by Dakota Lee Jonsgaard**  
© 2026 Dakota Lee Jonsgaard. All rights reserved.

CYVXAI-OS is a governed production operating system that converts reality into measurable outcomes:

```text
Reality
→ Constraint
→ Opportunity
→ Mission
→ Governed Action
→ Evidence
→ Outcome
→ Learning
→ Compounding Capability
```

It is not a prompt collection, static dashboard, disconnected agent demo, or unsupervised shell. It is one connected runtime for durable missions, universal entities, business operation, verified revenue, intelligence, evidence, governance, recovery, and repository evolution.

## What CYVX operates

### Mission Runtime

- enforced mission lifecycle and state transitions
- organization-scoped SQLite WAL persistence
- durable worker leases, retries, recovery, cancellation, and evaluation
- append-only events, artifacts, outcomes, and tamper-evident evidence
- backup, restore, diagnostics, and operator APIs

### Governance and Agent Foundry

- immutable CYVX Constitution
- Worker → Supervisor → Boss separation of duties
- deterministic policy checks and kill switches
- signed, scoped, expiring, single-use capability grants
- grant-bound agent creation, staging deployment, production deployment, and spending
- durable audit and governance ledgers

### Universal Entity Operator

CYVX can model and operate:

- people and households
- creators and ventures
- commerce and production systems
- distributors and marketplaces
- enterprises and institutions
- portfolios

Each entity connects to reality, constraints, outcome contracts, missions, governed execution, evidence, measured outcomes, knowledge, and learned capability.

### Verified Revenue Engine

- owner-controlled offer and conversion assets
- real prospect intake and permissioned CRM workflows
- governed campaigns with provider readiness and consent boundaries
- Stripe Checkout and signed, idempotent webhook verification
- evidence-backed owner receipt path
- client onboarding, fulfillment, acceptance, retention, renewal, and expansion
- separate truth states for prospects, leads, deals, checkouts, clients, and verified revenue

### Intelligence Fabric

- official-source registries and resilient collection
- normalized, evidence-backed opportunities
- scoring, prioritization, provenance, and mission drafts
- Minnesota procurement and business intelligence vertical
- reusable reality and next-best-action primitives

### Production Operations

- fail-closed authentication and startup validation
- Supabase Auth/OIDC, tenant isolation, RLS, agent identities, and production canaries
- Cloudflare edge controls and origin protection
- queues, retries, dead letters, feature flags, and kill switches
- structured redacted logs, traces, metrics, SLOs, alerts, and incident workflows
- encrypted backups, retention, restore drills, and recovery proof
- isolated staging and controlled production releases

### Repository Evolution Control Plane

CYVX now operates its own repository as a measurable production system:

- canonical repository contract
- capability inventory
- architecture, runtime, verification, security, automation, product, evidence, learning, and maintainability scoring
- drift and risk detection
- impact/effort/confidence-ranked upgrade queue
- generated repository evolution mission
- atomic proof snapshots and append-only history
- Prometheus metrics and mobile dashboard
- scheduled and pull-request CI verification

## Architecture

```text
Experience Plane
  Spark · Mobile UI · Public pages · Operator dashboards

Business Plane
  Universal entities · Venture operator · CRM · Revenue · Fulfillment

Execution Plane
  Missions · Workers · Schedulers · Providers · Foundry actions

Intelligence Plane
  Reality models · Constraints · Scoring · Recommendations · Learning

Trust Plane
  Constitution · RBAC · RLS · Approvals · Grants · Kill switches

Evidence Plane
  Events · Artifacts · Hash chains · Metrics · Outcomes · Recovery proof

Data Plane
  SQLite WAL · Supabase/PostgreSQL · Object storage · JSONL evidence

Operations Plane
  CI/CD · Observability · Backups · Restore drills · Status · Incidents
```

The phone is the control surface. Durable state, verification, automation, and proof remain in the production runtime.

## Requirements

- Node.js 22 or newer
- npm with the committed lockfile
- Linux, macOS, UserLAnd, or another Node-compatible environment
- provider credentials only for the external capabilities you intentionally activate

No production secret belongs in Git.

## Install

```bash
cd ~/CYVXAI-OS && \
npm ci --no-audit --no-fund
```

## Run

### Unified public runtime

```bash
cd ~/CYVXAI-OS && \
npm start
```

### Universal entity and revenue operator

```bash
cd ~/CYVXAI-OS && \
npm run operator
```

### Governance control plane

```bash
cd ~/CYVXAI-OS && \
npm run governance
```

### Minnesota intelligence vertical

```bash
cd ~/CYVXAI-OS && \
npm run intel:mn
```

### Repository evolution dashboard

```bash
cd ~/CYVXAI-OS && \
npm run repo:intelligence:serve
```

Open:

```text
http://127.0.0.1:3014/repo-intelligence
```

## Verify

### Complete production baseline

```bash
cd ~/CYVXAI-OS && \
npm ci --no-audit --no-fund && \
npm run verify:production-baseline
```

### Focused production capabilities

```bash
npm run verify:governance
npm run operator:verify
npm run revenue:verify
npm run verify:intel:mn
npm run repo:intelligence:verify
npm run backup:verify
```

### Runtime diagnostics

```bash
npm run doctor
npm run repo:intelligence
```

## Primary local surfaces

| Surface | Default route |
|---|---|
| Unified public product | `http://127.0.0.1:3000/` |
| Universal operator | `http://127.0.0.1:3020/operator` |
| Revenue engine | `http://127.0.0.1:3020/revenue` |
| Governance | `http://127.0.0.1:8790/governance` |
| Minnesota intelligence | `http://127.0.0.1:3010/intelligence/minnesota` |
| Repository evolution | `http://127.0.0.1:3014/repo-intelligence` |

Ports are environment-configurable. Public binding must use production authentication, edge controls, HTTPS, and protected secrets.

## Production truth model

CYVX distinguishes infrastructure from outcomes:

- an asset proves a file or deployed surface exists
- a prospect proves a real contact record exists
- a lead proves demand or qualification exists
- a deal proves a commercial opportunity exists
- a checkout proves a payment request exists
- a client requires a won deal or verified payment
- revenue requires provider verification or evidenced owner attestation
- fulfillment requires completion and acceptance evidence
- readiness requires passing checks and retained proof
- learning requires measured outcomes, not generated claims

## Safety and governance boundary

CYVX does not automatically gain unrestricted authority. External messaging, purchases, money movement, bid submission, contract signing, legal filing, medical decisions, credential changes, destructive migrations, and production deployment require separately implemented, tested, least-privilege capabilities and the applicable approval policy.

Repository evolution follows the same rule: detect and prioritize broadly, but stop before irreversible action.

## Persistent data

Default local state is stored under `~/.cyvx/`, including:

```text
mission-runtime.db
companies/
repository-intelligence/
logs/
backups/
```

Supabase/PostgreSQL production persistence remains organization-scoped and fail-closed until schema readiness, RLS, identities, and protected credentials are verified.

## Evidence and recovery

Every material production path is expected to expose one or more of:

- structured logs
- metrics and readiness
- immutable or hash-linked evidence
- provider receipts
- retained CI artifacts
- encrypted backups
- verified restore output
- measured outcomes

Run `npm run backup:verify` and `npm run repo:intelligence:verify` to prove recovery and repository integrity locally.

## Repository map

- `api/` — public and protected gateways
- `core/` — kernel, governance, missions, integrations, learning
- `runtime/` — durable mission and execution runtimes
- `services/` — operators, revenue, intelligence, repository intelligence
- `apps/` — bounded product verticals
- `ui/` and `spark/` — mobile and public experiences
- `supabase/` — migrations and cloud persistence contracts
- `observability/` and `ops/` — telemetry, operations, recovery, and release assets
- `scripts/` — one-command operation and verification
- `test/` — unit, integration, contract, security, and end-to-end proof
- `docs/` — architecture and runbooks
- `.github/workflows/` — CI, security, recovery, schema, and controlled release automation

The versioned repository contract at `config/repository-contract.json` is the machine-readable authority for required production capability.

## Key documentation

- `docs/operations/REPOSITORY_EVOLUTION_CONTROL_PLANE.md`
- `docs/operations/PRODUCTION_BASELINE.md`
- `docs/operations/INTEGRATION_BASELINE.md`
- `docs/AUTONOMOUS_COMPANY_OPERATOR.md`
- `docs/UNIVERSAL_OPERATOR.md`
- `docs/VENTURE_REVENUE_ENGINE.md`
- `docs/architecture/REPO_SPINE_MAP.md`

## Contact

- `dakota@cyvx.ai`
- `https://cyvx.ai`
