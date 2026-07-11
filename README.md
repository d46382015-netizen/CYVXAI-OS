# CYVX — Autonomous Infrastructure Intelligence
**Created by Dakota Lee Jonsgaard**  
© 2026 Dakota Lee Jonsgaard. All rights reserved.

CYVXAI-OS is an autonomous infrastructure intelligence platform for reality graphs, digital twins, missions, simulations, knowledge, and executive operations.

## Integration Baseline v8

CYVXAI-OS now includes credential-ready, fail-closed contracts for:

- Supabase Auth/OIDC, MFA, tenant context, RBAC, and PostgreSQL Row Level Security
- Supabase Queues/PGMQ, retries, dead letters, and pg_cron scheduling
- Cloudflare WAF, API rate limits, and direct-origin bypass protection
- Tenant-aware feature flags with an OpenFeature-compatible provider and live kill switches
- Hosted infrastructure telemetry, Langfuse AI traces/evaluations, and Sentry error tracking
- Privacy-bounded PostHog analytics
- Stripe webhook verification, subscriptions, and tenant entitlements
- Queue-backed Resend or Postmark transactional email
- GitHub Actions OIDC and optional short-lived credential exchange

The integration code is complete without embedding provider credentials. Live activation still requires real provider accounts, protected GitHub environments, encrypted secrets, database migrations, and retained staging evidence. See `docs/operations/INTEGRATION_BASELINE.md`.

## Production Baseline v7.1

The production baseline provides:

- Fail-closed production authentication and startup validation
- Managed PostgreSQL migrations and runtime snapshot persistence
- Authenticated encrypted backups, remote retention, restore commands, and scheduled restore drills
- Structured redacted logs, hosted OTLP traces/logs, Prometheus metrics, and alert rules
- External uptime checks, incident notifications, measurable SLOs, and an independent public status service
- Isolated staging and production deployment definitions
- Protected verify → migrate → deploy → readiness release workflows
- Incident response, support, security, recovery, and release runbooks

Production deployment remains intentionally controlled: staging may deploy after passing checks, while production auto-deploy is disabled and requires the protected release workflow.

## Architecture
- Reality Graph: entities, relationships, state, health, and impact
- Agent OS: lifecycle, memory, planning, delegation, and mission execution
- Mission Control: discover, plan, simulate, execute, monitor, optimize, report
- Digital Twin: live organizational models and recommended actions
- Simulation Chamber: outage, growth, cyber, market, and workflow scenarios
- Knowledge Galaxy: documents, events, decisions, and lessons learned
- Executive Intelligence: answers, forecasts, recommendations, and risk assessments
- Reality Engine: predictions, outcomes, calibration, proof, and baseline comparison
- Economics: costs, savings, ROI, utilization, and licensing
- Governance: RBAC, audit logs, approvals, kill switches, MFA, and tenant isolation
- Dashboard: `http://localhost:3000/`

## Installation
```bash
bash ./install.sh
```

## Start
```bash
bash ./start.sh
```

## Complete verification
```bash
npm ci --no-audit --no-fund && npm run verify:production-baseline
```

## Integration-only verification
```bash
npm run verify:integrations
```

## Cloudflare edge plan
```bash
CYVX_EDGE_ORIGIN_SECRET='32+ character secret' npm run cloudflare:plan
```

## GitHub OIDC proof
```bash
npm run oidc:smoke
```

## Backup and recovery proof
```bash
npm run backup:verify
```

## Integration API
- `POST /api/webhooks/stripe`
- `GET /api/v1/integrations/me`
- `GET /api/v1/integrations/status`
- `POST /api/v1/integrations/probe`
- `GET /api/v1/integrations/flags`
- `POST /api/v1/integrations/flags/:key`
- `POST /api/v1/integrations/jobs`
- `POST /api/v1/integrations/email`
- `POST /api/v1/integrations/analytics`
- `POST /api/v1/integrations/ai/score`
- `GET /api/v1/integrations/entitlements`

## Core API
- `GET /health`
- `GET /healthz`
- `GET /readyz`
- `GET /status`
- `GET /api/v1/platform`
- `GET /api/v1/entities`
- `POST /api/v1/entities`
- `GET /api/v1/relationships`
- `POST /api/v1/relationships`
- `GET /api/v1/graph`
- `GET /api/v1/agents`
- `POST /api/v1/agents`
- `GET /api/v1/missions`
- `POST /api/v1/missions`
- `GET /api/v1/simulations`
- `POST /api/v1/simulations`
- `GET /api/v1/reports`
- `POST /api/v1/reports`
- `GET /api/v1/commands`
- `POST /api/v1/commands`
- `GET /api/v1/events`
- `POST /api/v1/events`
- `GET /api/v1/coordination`
- `POST /api/v1/coordination`
- `GET /api/v1/intelligence`
- `GET /api/v1/patterns`
- `GET /api/v1/recommendations`
- `GET /api/v1/priorities`
- `GET /api/v1/executive`
- `GET /v1/agents`
- `GET /v1/leaderboard`
- `GET /v1/roadmap`
- `POST /ask`
- `GET /api/v1/cluster`
- `GET/POST /api/v1/workloads`
- `GET/POST /api/v1/actions`
- `GET /api/v1/metrics/history`
- `GET /api/v1/status-model`
- `GET /metrics`

## Product v1
- Operator workflow: `POST /api/v1/coordination`
- Primitive loop: `POST /api/v1/observations`, `POST /api/v1/significance`, `POST /api/v1/interventions`, `POST /api/v1/outcomes`, `POST /api/v1/knowledge`, `POST /api/v1/assignments`, `POST /api/v1/approvals`, `POST /api/v1/queue`
- Intelligence surfaces: `GET /api/v1/intelligence`, `GET /api/v1/patterns`, `GET /api/v1/recommendations`, `GET /api/v1/priorities`
- UI: Product v1 onboarding, search/filter, and audit trail
- API aliases: GET /api/v1/dashboard, POST /api/v1/onboard
- CLI aliases: `dashboard`, `workflow`, `onboard`, `coordination`

## CLI
```bash
node ./cli/cyvx.js help
```

## Contact
- `dakota@cyvx.ai`
- https://cyvx.ai

## Kernel v1
- Kernel services: Constitution, Reality, Significance, Intervention, Learning, Evolution
- Canonical objects: ConstitutionalCriterion, RealityObject, SignificanceRecord, Intervention, Outcome, EvolutionRecommendation, CIRMetric
- API: /api/v1/criteria, /api/v1/reality-objects, /api/v1/significance, /api/v1/interventions, /api/v1/outcomes, /api/v1/evolution, /api/v1/cir, /api/v1/kernel
- CLI: criteria, reality-objects, significance, interventions, outcomes, evolution, cir, kernel
- Compatibility debt: the legacy controller plane remains for backward compatibility and is not the formal kernel.

## Coordination Platform v1

CYVX Coordination Platform v1 runs on frozen Kernel v1 and extends the same JSON-backed state with live coordination records.

### Live surfaces
- /api/v1/coordination
- /api/v1/next-best-action
- /api/v1/humans
- /api/v1/resources
- /api/v1/assignments
- /api/v1/approvals
- /api/v1/queue

### CLI commands
- humans
- resources
- assign
- approvals
- queue
- nba
- coordination

### Coordination records
- Human roles
- Resource allocations
- Assignments
- Approvals
- Queue items
- Next best actions

Mission execution remains a pattern under the frozen kernel. Coordination decides who acts, when, and with what resources. The legacy controller plane remains compatibility debt.

## Intelligence Platform v1

CYVX Intelligence Platform v1 extends the frozen kernel and coordination layer with explainable pattern, recommendation, and priority intelligence.

### Live surfaces
- /api/v1/patterns
- /api/v1/recommendations
- /api/v1/priorities
- /api/v1/intelligence

### CLI commands
- patterns
- recommendations
- priorities
- intelligence

### Intelligence records
- Pattern
- Recommendation
- Priority

The intelligence layer turns outcomes, learning, trust, and CIR history into reusable patterns, explainable recommendations, and priority rankings.

## Proof Surfaces
- API: /api/v1/github/repository?owner=acme&repo=cyvx
- API: /api/v1/github/health?owner=acme&repo=cyvx
- API: /api/v1/github/proof?owner=acme&repo=cyvx
- API: /api/v1/repository-health?owner=acme&repo=cyvx
- API: /api/v1/proof?owner=acme&repo=cyvx
- CLI: repository-health, repo-health, proof, github, github-health, github-proof

## Reality Engine vΩ
- API: `GET /api/v1/reality-engine`
- CLI: `reality-engine`
- Purpose: compress architecture into verified prediction → outcome → error → learning loops.

## Self-Scan & Proof Loop
- CLI: `node ./cli/cyvx.js scan-self`
- CLI: `node ./cli/cyvx.js self-scan-mission`
- API: `GET /api/v1/self-scan`
- API: `GET /api/v1/self-scan-mission`

CYVX can analyze its own repository, identify top constraints, generate next-best actions, create missions, expose the result through API/dashboard surfaces, and record proof-ledger improvement over time.

## Current proof state
- Production and integration CI gates operational
- Terraform workflow manual-only
- Repository self-scan operational
- Self-scan mission loop operational
- Provider activation intentionally blocked until real credentials and live evidence exist

## RealityOS vΩ
- RealityOS layers the repository around observation, modeling, intelligence, compression, operation, learning, and interface.
- The phone is the final presentation layer of a much larger system.
- RealityEngine exposes the layered model through `GET /api/v1/reality-engine`.
