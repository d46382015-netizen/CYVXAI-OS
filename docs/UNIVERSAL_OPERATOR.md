# CYVX Universal Operator

CYVX Universal Operator connects the repository's existing universal entity and RealityOS architecture to the durable mission, governance, execution, evidence, outcome, and capability-learning runtime.

It replaces the product assumption that every operated subject is a company. A company is now one adapter on a shared universal entity spine.

## Operating model

```text
Universal Entity
→ Reality Snapshot
→ Constraint and Opportunity Map
→ Outcome Contract
→ Mission
→ Capability Plan
→ Approval
→ Governed Execution
→ Evidence
→ Measured Outcome
→ Knowledge
→ Learned Capability
```

Every entity remains owner-controlled. External actions remain bounded by identity, permissions, budgets, approvals, prohibited-action policy, evidence requirements, and stop conditions.

## Supported operating modes

| Type | Operator | Primary scope |
|---|---|---|
| `personal` | Personal Operator | goals, resources, obligations, actions, learning |
| `household` | Household Operator | bills, schedules, maintenance, benefits, resilience |
| `creator` | Creator Operator | audience, products, content, distribution, retention |
| `venture` | Venture Operator | offers, demand, acquisition, fulfillment, revenue |
| `commerce` | Commerce Operator | catalog, orders, payments, inventory, fulfillment |
| `production` | Production Operator | capacity, materials, quality, traceability, throughput |
| `distribution` | Distribution Operator | warehouses, inventory, replenishment, routing, delivery |
| `enterprise` | Enterprise Operator | departments, workflows, controls, budgets, performance |
| `marketplace` | Marketplace Operator | demand, supply, matching, trust, disputes, liquidity |
| `institution` | Institution Operator | programs, participants, resources, service outcomes |
| `portfolio` | Portfolio Command | entities, dependencies, allocation, risk, interventions |

## Existing venture compatibility

The original Autonomous Company Operator remains active as the Venture adapter.

On startup, existing rows in `operator_companies` are registered in `operator_entities` without deleting, renaming, or rewriting the legacy records. Existing ventures preserve:

- company ID;
- mission and outcome contract;
- actions and evidence;
- lead and revenue records;
- workspace path;
- public `/c/:slug` page;
- v1 API behavior.

The current Bid & Revenue Sprint therefore appears in the universal console as a `venture` while continuing to use its proven lead-capture and conversion adapter.

## RealityOS integration

The universal operator uses `core/platform/kernel.js` as its reality and capability graph.

For every operated entity, CYVX synchronizes:

- entity identity, type, ownership, state, economics, risk, opportunity and capability;
- goals and measurable objectives;
- linked missions;
- relationships between operated entities;
- measured outcomes;
- activation knowledge;
- learned reusable capabilities.

The default platform state is stored at:

```text
~/.cyvx/platform-state.json
```

Override it with:

```text
CYVX_PLATFORM_STATE_FILE=/path/to/platform-state.json
```

## Durable storage

Universal operator state uses the existing SQLite WAL mission database:

```text
~/.cyvx/mission-runtime.db
```

Tables:

```text
operator_entities
operator_entity_contracts
operator_entity_actions
operator_entity_action_approvals
operator_entity_metrics
operator_entity_ticks
operator_entity_relationships
```

Existing Venture adapter tables remain unchanged:

```text
operator_companies
operator_contracts
operator_actions
operator_action_approvals
operator_metrics
operator_leads
operator_ticks
```

Owned universal entity workspaces default to:

```text
~/.cyvx/entities/<organization-id>/<entity-id>/
```

Each activated entity receives connected artifacts such as:

```text
entity.json
reality/snapshot.json
reality/constraint-map.md
plans/outcome-plan.md
domain/*.json
metrics/baseline.json
public/index.html
```

## Production and distribution primitives

The Production adapter creates:

- capacity and constraint model;
- throughput, cycle-time, yield, downtime, and work-in-process measurements;
- incoming, in-process, final, and release quality gates;
- material lot, work order, operator, machine, inspection, and shipment traceability;
- demand-to-distribution flow map.

The Distribution adapter creates:

- network node and service-level model;
- availability, fill-rate, on-time delivery, and cost-per-delivery measurements;
- forecasting, reorder point, safety stock, allocation, and replenishment policy;
- order, picking, staging, loading, routing, delivery, proof, and exception workflow.

These artifacts are real connected operating models. External ERP, warehouse, machine, routing, payment, and messaging execution requires separately authorized adapters and credentials.

## APIs

Universal v2:

```text
GET  /api/v2/operator/entity-types
GET  /api/v2/operator/entities
POST /api/v2/operator/entities
GET  /api/v2/operator/entities/:id
POST /api/v2/operator/entities/:id/approve
POST /api/v2/operator/entities/:id/tick
POST /api/v2/operator/entities/:id/run
POST /api/v2/operator/entities/:id/control
POST /api/v2/operator/entities/:id/metrics
POST /api/v2/operator/actions/:id/approval
POST /api/v2/operator/relationships
POST /api/v2/operator/tick
GET  /api/v2/operator/export
```

Entity workspaces:

```text
GET /e/:slug
```

Legacy Venture v1 remains available:

```text
/api/v1/operator/*
/c/:slug
```

## Run

Local development and UserLAnd:

```bash
cd ~/CYVXAI-OS && \
CYVX_ALLOW_INSECURE_LOCAL=true npm run operator
```

Open:

```text
http://127.0.0.1:3020/operator
```

The same command starts:

- mission API;
- durable mission worker;
- universal operator API;
- Venture compatibility API;
- adaptive mobile console;
- bounded scheduler;
- RealityOS synchronization.

## Verify

```bash
cd ~/CYVXAI-OS && \
npm run operator:verify
```

The verification suite proves:

- all eleven entity modes are registered;
- domain-specific capability plans are assembled;
- Personal activation reaches mission learning and RealityOS capability creation;
- Production and Distribution artifacts are connected and persisted;
- existing company data migrates without loss;
- generic outcome metrics complete contracts;
- outcomes are written into RealityOS;
- entity relationships are mirrored into the reality graph;
- v2 and v1 APIs operate together;
- unified startup, health, UI, and persistence work end to end.

## Governance boundary

The universal operator does not automatically gain permission to act everywhere merely because an entity exists.

The default prohibited actions include:

- sending external messages;
- purchases;
- bid submission;
- contract signing;
- transferring funds;
- medical decisions;
- legal filings.

Each new real-world executor must be added as a production capability with:

- explicit input and output contracts;
- least-privilege credentials;
- validation and idempotency;
- cost and rate limits;
- approval policy;
- evidence and audit records;
- retries and failure handling;
- rollback or compensating action;
- focused and regression tests.

## Product boundary

CYVX Universal Operator is not eleven disconnected applications. It is one operating kernel with entity-specific adapters and workspaces.

```text
One entity graph
One mission lifecycle
One governance boundary
One evidence ledger
One outcome model
One learning system
Many operating adapters
```
