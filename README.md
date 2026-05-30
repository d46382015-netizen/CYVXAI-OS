# CYVX — Autonomous Infrastructure Intelligence
**Created by Dakota Lee Jonsgaard**  
© 2026 Dakota Lee Jonsgaard. All rights reserved.

CYVXAI-OS is an autonomous infrastructure intelligence platform for reality graphs, digital twins, missions, simulations, knowledge, and executive operations.

## Architecture
- Reality Graph: entities, relationships, state, health, and impact
- Agent OS: lifecycle, memory, planning, delegation, and mission execution
- Mission Control: discover, plan, simulate, execute, monitor, optimize, report
- Digital Twin: live organizational models and recommended actions
- Simulation Chamber: outage, growth, cyber, market, and workflow scenarios
- Knowledge Galaxy: documents, events, decisions, and lessons learned
- Executive Intelligence: answers, forecasts, recommendations, and risk assessments
- Economics: costs, savings, ROI, utilization, and licensing
- Governance: RBAC, audit logs, approvals, kill switch, and tenant isolation
- Dashboard: `http://localhost:3000/`

## Installation
```bash
bash ./install.sh
```

## Start
```bash
bash ./start.sh
```

## API
- `GET /health`
- `GET /healthz`
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
- CLI aliases: `workflow`, `onboard`, `coordination`

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
- Next build target: CYVX Coordination Platform v1.


## Coordination Platform v1

CYVX Coordination Platform v1 runs on frozen Kernel v1 and extends the same JSON-backed state with live coordination records.

### New live surfaces
- /api/v1/coordination
- /api/v1/next-best-action
- /api/v1/humans
- /api/v1/resources
- /api/v1/assignments
- /api/v1/approvals
- /api/v1/queue

### New CLI commands
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

### Coordination rule
Mission execution remains a pattern under the frozen kernel. Coordination decides who acts, when, and with what resources. The legacy controller plane remains compatibility debt.

## Intelligence Platform v1

CYVX Intelligence Platform v1 extends the frozen kernel and coordination layer with explainable pattern, recommendation, and priority intelligence.

### New live surfaces
- /api/v1/patterns
- /api/v1/recommendations
- /api/v1/priorities
- /api/v1/intelligence

### New CLI commands
- patterns
- recommendations
- priorities
- intelligence

### Intelligence records
- Pattern
- Recommendation
- Priority

### Purpose
The intelligence layer strengthens the existing loop by turning outcomes, learning, trust, and CIR history into reusable patterns, explainable recommendations, and priority rankings.
