#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const outDir = path.resolve(process.argv[2] || path.join(process.cwd(), "dist", "wiki"));

const nav = "[Home](Home) · [Architecture](Architecture) · [Installation](Installation) · [Operator Guide](Operator-Guide) · [API Reference](API-Reference) · [CLI Reference](CLI-Reference)";

const pages = {
  "Home.md": `# CYVXAI-OS

**Autonomous Infrastructure Intelligence for observing reality, coordinating execution, proving outcomes, and improving continuously.**

Created by **Dakota Lee Jonsgaard**  
© 2026 Dakota Lee Jonsgaard. All rights reserved.

---

## What CYVX Is

CYVXAI-OS is a production-oriented intelligence and coordination platform that turns real-world signals into measurable action.

> **Observe → Model → Prioritize → Coordinate → Execute → Measure → Learn → Improve**

CYVX combines a reality graph, autonomous agents, mission control, digital twins, simulations, executive intelligence, governance, proof systems, and continuous learning behind one operational interface.

## Core Platform

- **Reality Graph:** entities, relationships, state, health, dependencies, constraints, and impact.
- **Agent OS:** lifecycle, memory, planning, delegation, confidence, and mission execution.
- **Mission Control:** discover, plan, simulate, execute, monitor, optimize, and report.
- **Coordination Platform:** owners, resources, assignments, approvals, queues, and next-best actions.
- **Intelligence Platform:** patterns, recommendations, priorities, forecasts, and risk assessment.
- **Reality Engine:** predictions, outcomes, error, calibration, proof, and learning.
- **Spark Runtime:** controlled execution, evidence capture, interruption, export, and owner control.

## Quick Start

~~~bash
git clone https://github.com/d46382015-netizen/CYVXAI-OS.git
cd CYVXAI-OS
bash ./install.sh
bash ./start.sh
~~~

Open:

~~~text
http://127.0.0.1:3000/
~~~

Verify:

~~~bash
npm run verify
~~~

## Documentation

- [Architecture](Architecture)
- [Installation](Installation)
- [Operator Guide](Operator-Guide)
- [API Reference](API-Reference)
- [CLI Reference](CLI-Reference)
- [Spark Runtime](Spark-Runtime)
- [Kernel Specification](Kernel-Specification)
- [Coordination Platform](Coordination-Platform)
- [Intelligence Platform](Intelligence-Platform)
- [Reality Engine](Reality-Engine)
- [Security and Governance](Security-and-Governance)
- [Testing and Verification](Testing-and-Verification)
- [Deployment](Deployment)
- [Troubleshooting](Troubleshooting)
- [Contribution Standards](Contribution-Standards)
- [Product Roadmap](Product-Roadmap)

## Current Mission

> **Understand reality, identify constraints, coordinate intelligence and resources, execute controlled interventions, prove outcomes, and improve over time.**
`,

  "Architecture.md": `# Architecture

${nav}

CYVXAI-OS is organized around one closed operating loop:

> **Observe → Model → Prioritize → Coordinate → Execute → Measure → Learn → Improve**

## Layered Model

~~~text
Users and Operators
        ↓
Dashboard · CLI · API · WebSocket
        ↓
Mission Control · Executive Intelligence
        ↓
Patterns · Recommendations · Priorities
        ↓
Humans · Agents · Resources · Approvals · Queue
        ↓
Spark Runtime · Commands · Workloads · Actions
        ↓
Outcomes · Metrics · Events · Proof Ledger
        ↓
Learning · Calibration · Evolution
~~~

## Runtime Areas

~~~text
api/       HTTP API, WebSocket upgrade, UI serving, authorization, rate limiting
cli/       Command-line interface and local kernel operations
core/      Controller, platform kernel, agents, intelligence, proof, integrations
spark/     Controlled autonomous runtime and portable world assets
ui/        Browser interface served by the API process
scripts/   Build, verification, self-scan, strategy, agency, and automation tools
test/      Node test suites for platform, API, CLI, Spark, and security behavior
~~~

## Architectural Invariants

1. Reality is the source of truth.
2. Every mission has a measurable objective.
3. Every action has an accountable owner.
4. High-impact work requires authorization.
5. Decisions preserve evidence.
6. Predictions are compared with actual outcomes.
7. Failures become reusable learning.
8. Interfaces remain stable while internals improve.
9. Autonomous actions remain observable and interruptible.
10. Improvement is measured against a baseline.

## Persistence

The platform kernel supports repository-backed persistent state through the configured platform state file. The standard launcher also creates a user runtime directory at `~/.cyvx`. Spark keeps its portable runtime assets under `.cyvx/` in its operating context.

Production deployments should separate application code, runtime state, backups, secrets, and logs while preserving the documented API and CLI contracts.
`,

  "Installation.md": `# Installation

${nav}

## Requirements

- Git
- Bash
- Node.js
- npm
- A writable home directory
- An available TCP port

Check the environment:

~~~bash
git --version
bash --version
node --version
npm --version
~~~

## Install and Start

~~~bash
git clone https://github.com/d46382015-netizen/CYVXAI-OS.git && \
cd CYVXAI-OS && \
bash ./install.sh && \
bash ./start.sh
~~~

The installer uses `npm ci --no-audit --no-fund` when `package-lock.json` exists and falls back to `npm install --no-audit --no-fund` otherwise.

Default runtime:

~~~text
CYVX_HOST=0.0.0.0
CYVX_PORT=3000
~~~

Open `http://127.0.0.1:3000/`.

## Verify

~~~bash
cd ~/CYVXAI-OS
npm run verify
curl -fsS http://127.0.0.1:3000/health
~~~

## Android UserLAnd

~~~bash
apt update && \
apt install -y git curl bash nodejs npm && \
cd ~ && \
git clone https://github.com/d46382015-netizen/CYVXAI-OS.git && \
cd CYVXAI-OS && \
bash ./install.sh && \
bash ./start.sh
~~~

## Android Termux

~~~bash
pkg update -y && \
pkg install -y git nodejs-lts curl && \
cd ~ && \
git clone https://github.com/d46382015-netizen/CYVXAI-OS.git && \
cd CYVXAI-OS && \
bash ./install.sh && \
bash ./start.sh
~~~

## Custom Port

~~~bash
CYVX_PORT=8787 bash ./start.sh
~~~

## Update

~~~bash
cd ~/CYVXAI-OS && \
git status --short && \
git pull --ff-only && \
bash ./install.sh && \
npm run verify
~~~
`,

  "Operator-Guide.md": `# Operator Guide

${nav}

## Operator Cycle

~~~text
1. Verify health
2. Inspect platform state
3. Observe reality
4. Review priorities and recommendations
5. Select the highest-value constraint
6. Confirm owner, resources, and approval
7. Execute through an authorized runtime
8. Monitor progress, failures, and retries
9. Record the outcome
10. Compare expected and actual results
11. Preserve proof
12. Store learning and recalculate the next-best action
~~~

## Start and Inspect

~~~bash
cd ~/CYVXAI-OS
npm run verify
bash ./start.sh
~~~

From another terminal:

~~~bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/api/v1/platform
curl -fsS http://127.0.0.1:3000/api/v1/priorities
curl -fsS http://127.0.0.1:3000/api/v1/next-best-action
curl -fsS http://127.0.0.1:3000/api/v1/queue
~~~

## Approval Rule

Require explicit approval before actions that can affect production, users, protected data, permissions, money, publishing, security controls, or irreversible state.

Approval authorizes execution; it does not prove success. Completion requires a measured outcome and evidence.

## Logging

~~~bash
cd ~/CYVXAI-OS && \
mkdir -p logs && \
bash ./start.sh 2>&1 | tee "logs/operator-$(date +%Y%m%d-%H%M%S).log"
~~~

Do not place secrets, tokens, credentials, or protected personal data in logs.

## Safe Shutdown

Press `CTRL+C`, then confirm the service stopped:

~~~bash
curl -fsS http://127.0.0.1:3000/health
ps aux | grep '[n]ode ./api/index.js'
~~~
`,

  "API-Reference.md": `# API Reference

${nav}

Base URL:

~~~text
http://127.0.0.1:3000
~~~

Responses are JSON and include CYVX attribution, version, and timestamp metadata.

## Authentication

When `CYVX_API_KEY` is unset, the local API accepts requests without a key. When set, send either header:

~~~text
x-api-key: YOUR_KEY
Authorization: Bearer YOUR_KEY
~~~

Default rate limit is 120 requests per minute and can be changed with `CYVX_RATE_LIMIT`.

## Core Health

~~~text
GET /health
GET /healthz
GET /status
GET /metrics
GET /api/v1/status-model
GET /api/v1/metrics/history
~~~

## Platform and Dashboard

~~~text
GET  /api/v1/platform
GET  /api/v1/overview
GET  /api/v1/dashboard
POST /api/v1/onboard
~~~

## Reality and Kernel

~~~text
GET/POST /api/v1/observations
GET      /api/v1/reality
GET/POST /api/v1/criteria
GET/POST /api/v1/reality-objects
GET/POST /api/v1/significance
GET/POST /api/v1/interventions
GET/POST /api/v1/outcomes
GET      /api/v1/evolution
GET      /api/v1/cir
GET      /api/v1/kernel
GET      /api/v1/reality-engine
~~~

## Graph, Agents, and Missions

~~~text
GET/POST /api/v1/entities
GET/POST /api/v1/relationships
GET      /api/v1/graph
GET/POST /api/v1/agents
GET/POST /api/v1/missions
GET/POST /api/v1/simulations
GET/POST /api/v1/reports
GET/POST /api/v1/commands
GET/POST /api/v1/events
~~~

## Coordination and Intelligence

~~~text
GET/POST /api/v1/coordination
GET      /api/v1/next-best-action
GET      /api/v1/humans
GET      /api/v1/resources
GET      /api/v1/assignments
GET      /api/v1/approvals
GET      /api/v1/queue
GET/POST /api/v1/patterns
GET/POST /api/v1/recommendations
GET      /api/v1/priorities
GET      /api/v1/intelligence
GET      /api/v1/executive
~~~

## Proof and Self-Improvement

~~~text
GET /api/v1/repository-health
GET /api/v1/proof
GET /api/v1/proof-ledger
GET /api/v1/tribunal
GET /api/v1/github/repository
GET /api/v1/github/health
GET /api/v1/github/proof
GET /api/v1/self-scan
GET /api/v1/self-scan-mission
~~~

## Workloads and Actions

~~~text
GET/POST /api/v1/workloads
GET/POST /api/v1/actions
POST     /ask
~~~

## Example

~~~bash
curl -fsS \
  -H 'content-type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  http://127.0.0.1:3000/api/v1/platform
~~~

POST requests accept JSON bodies. Keep payloads under the built-in 1 MB limit.

## WebSocket

Connect to `/ws`. When API authentication is enabled, include the same API key header during the upgrade request.
`,

  "CLI-Reference.md": `# CLI Reference

${nav}

Run help:

~~~bash
node ./cli/cyvx.js help
~~~

or:

~~~bash
npm run cli -- help
~~~

## Core Inspection

~~~bash
node ./cli/cyvx.js status
node ./cli/cyvx.js health
node ./cli/cyvx.js graph
node ./cli/cyvx.js agents
node ./cli/cyvx.js missions
node ./cli/cyvx.js events
node ./cli/cyvx.js observations
node ./cli/cyvx.js reality
node ./cli/cyvx.js reality-engine
~~~

## Kernel and Intelligence

~~~bash
node ./cli/cyvx.js criteria
node ./cli/cyvx.js reality-objects
node ./cli/cyvx.js significance
node ./cli/cyvx.js interventions
node ./cli/cyvx.js outcomes
node ./cli/cyvx.js evolution
node ./cli/cyvx.js cir
node ./cli/cyvx.js kernel
node ./cli/cyvx.js patterns
node ./cli/cyvx.js recommendations
node ./cli/cyvx.js priorities
node ./cli/cyvx.js intelligence
~~~

## Coordination

~~~bash
node ./cli/cyvx.js humans
node ./cli/cyvx.js resources
node ./cli/cyvx.js approvals
node ./cli/cyvx.js queue
node ./cli/cyvx.js nba
node ./cli/cyvx.js coordination
node ./cli/cyvx.js workflow
~~~

Use `key=value` arguments:

~~~bash
node ./cli/cyvx.js queue status=pending
node ./cli/cyvx.js repository-health owner=d46382015-netizen repo=CYVXAI-OS
~~~

## Company Modeling and Simulation

~~~bash
node ./cli/cyvx.js onboard "Acme Robotics" employees=50 systems=12 teams=4
node ./cli/cyvx.js model-company "Acme Robotics" employees=50
node ./cli/cyvx.js simulate outage "Add verification gates"
node ./cli/cyvx.js command "model my company"
node ./cli/cyvx.js report "Executive operating report"
~~~

## Proof and Self-Scan

~~~bash
node ./cli/cyvx.js repository-health owner=d46382015-netizen repo=CYVXAI-OS
node ./cli/cyvx.js proof owner=d46382015-netizen repo=CYVXAI-OS
node ./cli/cyvx.js github-health owner=d46382015-netizen repo=CYVXAI-OS
node ./cli/cyvx.js scan-self
node ./cli/cyvx.js self-scan-mission
~~~

## Serve

~~~bash
CYVX_PORT=3000 node ./cli/cyvx.js serve
~~~
`,

  "Spark-Runtime.md": `# Spark Runtime

${nav}

Spark is CYVX's controlled autonomous execution layer. It stores runtime state, creates portable world assets, records evidence, captures leads, queues follow-up work, and preserves owner control over approval, interruption, configuration, and export.

## Start

~~~bash
cd ~/CYVXAI-OS
bash ./spark/start.sh
~~~

Equivalent package command:

~~~bash
npm run spark:run
~~~

Open:

~~~text
http://127.0.0.1:3100
~~~

## Verify

~~~bash
npm run spark:test
npm run verify
~~~

Spark tests cover runtime behavior, server behavior, and security controls.

## Operating Rules

Spark work must be:

- validated
- authorized
- assigned
- observable
- bounded
- measurable
- interruptible
- supported by evidence

Stop execution when authorization disappears, scope changes unexpectedly, repeated failures increase risk, evidence capture fails, or the action affects an unintended target.

## State and Evidence

Spark uses `.cyvx/` for portable runtime state. Back up this directory before destructive maintenance or migration.
`,

  "Kernel-Specification.md": `# Kernel Specification

${nav}

CYVX Kernel v1 is the stable conceptual foundation beneath coordination, intelligence, execution, proof, and evolution.

## Six Services

1. **Constitution** — rules, permissions, limits, and evaluation criteria.
2. **Reality** — verified objects, events, relationships, and current state.
3. **Significance** — determines what matters and why.
4. **Intervention** — defines controlled actions intended to change reality.
5. **Learning** — compares expectations with outcomes and stores lessons.
6. **Evolution** — recommends improvements to policies, workflows, agents, and system behavior.

## Canonical Records

- Constitutional Criterion
- Reality Object
- Significance Record
- Intervention
- Outcome
- Evolution Recommendation
- CIR Metric

Related operational records include missions, assignments, resources, approvals, queue items, patterns, recommendations, priorities, predictions, and proof records.

## Kernel API

~~~text
GET/POST /api/v1/criteria
GET/POST /api/v1/reality-objects
GET/POST /api/v1/significance
GET/POST /api/v1/interventions
GET/POST /api/v1/outcomes
GET      /api/v1/evolution
GET      /api/v1/cir
GET      /api/v1/kernel
~~~

## Invariants

- Canonical records must be durable and auditable.
- Every intervention must reference a reason and measurable outcome.
- Learning must compare expected and actual results.
- Evolution recommendations must preserve evidence and explain tradeoffs.
- Compatibility layers may exist, but they do not redefine the frozen kernel.
`,

  "Coordination-Platform.md": `# Coordination Platform

${nav}

Coordination decides **who acts, when, with what resources, under which approval, and in what order**.

## Coordination Records

- Humans
- Agents
- Resources
- Assignments
- Approvals
- Queue items
- Priorities
- Next-best actions

## Operating Flow

~~~text
Significance Record
      ↓
Intervention
      ↓
Mission
      ↓
Assignment + Resource Allocation
      ↓
Approval
      ↓
Execution Queue
      ↓
Outcome
      ↓
Learning + CIR Update
      ↓
Next-Best Action
~~~

## API

~~~text
GET/POST /api/v1/coordination
GET      /api/v1/next-best-action
GET      /api/v1/humans
GET      /api/v1/resources
GET      /api/v1/assignments
GET      /api/v1/approvals
GET      /api/v1/queue
~~~

## CLI

~~~bash
node ./cli/cyvx.js humans
node ./cli/cyvx.js resources
node ./cli/cyvx.js assign missionId=MISSION ownerId=OWNER
node ./cli/cyvx.js approvals
node ./cli/cyvx.js queue
node ./cli/cyvx.js nba
node ./cli/cyvx.js coordination
~~~

## Readiness Rule

Do not queue high-impact execution unless the objective, owner, resources, approval state, success metric, and evidence destination are known.
`,

  "Intelligence-Platform.md": `# Intelligence Platform

${nav}

The intelligence layer converts operating history, outcomes, trust, proof, and CIR data into explainable decision support.

## Outputs

- Patterns
- Recommendations
- Priorities
- Forecasts
- Risks
- Opportunities
- Executive summaries
- Next-best actions

## API

~~~text
GET/POST /api/v1/patterns
GET/POST /api/v1/recommendations
GET      /api/v1/priorities
GET      /api/v1/intelligence
GET      /api/v1/executive
GET      /api/v1/next-best-action
GET      /api/v1/decision-intelligence
GET      /api/v1/daily-decision-brief
GET      /api/v1/truth-model
~~~

## Quality Standard

Every recommendation should explain:

1. What was detected
2. Why it matters
3. Which evidence supports it
4. What action is recommended
5. What outcome is expected
6. How success will be measured
7. Which risks or dependencies remain

Intelligence is advisory until an authorized mission and execution path exist.
`,

  "Reality-Engine.md": `# Reality Engine

${nav}

The Reality Engine connects observation, prediction, intervention, outcome, error measurement, proof, and learning.

## Closed Loop

~~~text
Observation → Reality Model → Prediction → Intervention → Outcome
     ↑                                                  ↓
Evolution ← Learning ← Error and Calibration Measurement
~~~

## Measurements

- Expected outcome
- Actual outcome
- Baseline
- Prediction error
- Calibration error
- Confidence accuracy
- Outcome quality
- Side effects
- Resource cost
- Reusable lessons

## Interfaces

~~~text
GET /api/v1/reality-engine
GET /api/v1/observations
GET /api/v1/reality
GET /api/v1/outcomes
GET /api/v1/proof-ledger
~~~

CLI:

~~~bash
node ./cli/cyvx.js reality-engine
node ./cli/cyvx.js observations
node ./cli/cyvx.js outcomes
~~~

A mission is complete only after its outcome is measured and supported by evidence. A command returning successfully is execution evidence, not outcome proof.
`,

  "Security-and-Governance.md": `# Security and Governance

${nav}

CYVX autonomy must remain observable, authorized, bounded, interruptible, measurable, and accountable.

## Built-In API Controls

- Optional API key through `CYVX_API_KEY`
- `x-api-key` and Bearer token support
- Per-client rate limiting through `CYVX_RATE_LIMIT`
- 1 MB JSON body limit
- Explicit WebSocket authorization
- Structured JSON responses

## Production Requirements

Before public exposure:

- place CYVX behind TLS
- use a dedicated runtime account
- restrict inbound network access
- configure a strong API key
- protect environment variables and secrets
- separate development and production state
- retain audit evidence
- monitor health and rate-limit events
- back up persistent state
- test recovery and interruption procedures

## Approval Tiers

Require approval for production changes, destructive writes, protected data access, permission changes, financial activity, public publishing, external user impact, and irreversible operations.

## Logging Rules

Logs must not contain API keys, passwords, access tokens, private keys, or unnecessary personal information.

## Incident Rule

Contain first, preserve evidence second, restore a safe state third, verify health fourth, and only then resume execution.
`,

  "Testing-and-Verification.md": `# Testing and Verification

${nav}

## Standard Verification

~~~bash
cd ~/CYVXAI-OS
npm run verify
~~~

` + "`npm run verify` executes the Node test suite and the project build." + `

## Individual Commands

~~~bash
npm test
npm run build
npm run spark:test
~~~

## Live Verification

~~~bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/status
curl -fsS http://127.0.0.1:3000/api/v1/platform
curl -fsS http://127.0.0.1:3000/api/v1/reality-engine
~~~

## Evidence Capture

~~~bash
mkdir -p logs
npm run verify 2>&1 | tee "logs/verify-$(date +%Y%m%d-%H%M%S).log"
~~~

## Release Gate

Do not deploy when tests fail, the build fails, health checks fail, required state is not writable, approval controls are unavailable, or the rollback path is unknown.

## Test Expectations

Tests should cover success, invalid input, authorization, rate limiting, persistence, recovery, retries, idempotency, API contracts, CLI behavior, Spark security, and regression cases for every fixed defect.
`,

  "Deployment.md": `# Deployment

${nav}

## Deployment Model

CYVX runs as a Node.js HTTP service that also serves the UI and upgrades authorized WebSocket connections.

~~~bash
CYVX_HOST=0.0.0.0 CYVX_PORT=3000 bash ./start.sh
~~~

## Required Environment

~~~text
CYVX_HOST
CYVX_PORT
CYVX_API_KEY
CYVX_RATE_LIMIT
CYVX_DB
CYVX_PLATFORM_STATE
CYVX_PROOF_LEDGER_PATH
~~~

Only set values your deployment uses. Keep secrets outside the repository.

## Production Checklist

- dedicated runtime user
- pinned Node.js version
- verified dependency install
- passing tests and build
- durable writable state
- TLS reverse proxy
- API authentication
- firewall restrictions
- health monitoring
- log retention
- backup and restore procedure
- rollback plan

## Preflight

~~~bash
cd ~/CYVXAI-OS && \
bash ./install.sh && \
npm run verify
~~~

## Health Probe

~~~text
GET /health
~~~

## Rollback

Preserve the previous release and runtime backup. Stop the failed release, restore the prior code and compatible state, start it, and verify `/health`, `/status`, and critical API routes before reopening traffic.

A local successful start is not equivalent to a secured public deployment.
`,

  "Troubleshooting.md": `# Troubleshooting

${nav}

## Missing Node.js

~~~bash
command -v node
node --version
npm --version
~~~

Install Node.js and npm, then rerun `bash ./install.sh`.

## Clean Dependency Repair

~~~bash
cd ~/CYVXAI-OS && \
rm -rf node_modules && \
npm cache verify && \
bash ./install.sh && \
npm run verify
~~~

## Port 3000 Is Busy

~~~bash
ss -ltnp 2>/dev/null | grep ':3000'
CYVX_PORT=8787 bash ./start.sh
~~~

## Dashboard Does Not Open

~~~bash
ps aux | grep '[n]ode ./api/index.js'
curl -v http://127.0.0.1:3000/health
~~~

## API Returns 401

The server has `CYVX_API_KEY` configured. Send `x-api-key` or `Authorization: Bearer` with the matching value.

## API Returns 429

The client exceeded the configured per-minute limit. Reduce request frequency or intentionally adjust `CYVX_RATE_LIMIT`.

## Capture Diagnostics

~~~bash
cd ~/CYVXAI-OS && \
mkdir -p logs && \
{
  date
  git status --short
  node --version
  npm --version
  curl -sS http://127.0.0.1:3000/health || true
  curl -sS http://127.0.0.1:3000/status || true
  curl -sS http://127.0.0.1:3000/api/v1/platform || true
} 2>&1 | tee "logs/diagnostic-$(date +%Y%m%d-%H%M%S).log"
~~~

Preserve the first failure output. Repeated retries can destroy useful evidence.
`,

  "Contribution-Standards.md": `# Contribution Standards

${nav}

## Contribution Rule

Every change must improve a real connected capability. Avoid disconnected demos, duplicate pathways, placeholder behavior, and undocumented state changes.

## Required Change Quality

A production-impacting contribution should include:

- connected implementation
- input validation
- failure handling
- logging or evidence
- tests
- documentation
- backward-compatibility assessment
- run and verification steps

## Local Workflow

~~~bash
git checkout -b feature/descriptive-name
npm run verify
git status --short
git add .
git commit -m "Describe the production capability"
~~~

## Pull Request Standard

State the constraint, architecture decision, files changed, verification performed, security impact, migration impact, rollback path, and measured outcome.

## Review Priorities

1. Correctness
2. Security and authorization
3. Persistence and data integrity
4. Runtime behavior
5. Tests
6. Observability
7. Documentation
8. Maintainability

Never commit secrets, credentials, generated dependency directories, private data, or runtime state.
`,

  "Product-Roadmap.md": `# Product Roadmap

${nav}

The roadmap follows the CYVX loop: reality first, constraints second, measurable outcomes third.

## Now — Reliable Single-Node Platform

- stabilize API and CLI contracts
- strengthen validation and error schemas
- expand tests around persistence and recovery
- unify health, status, metrics, and proof
- document every production surface
- preserve mobile and UserLAnd compatibility

## Next — Governed Autonomous Execution

- policy-based authorization
- durable approval workflows
- idempotent execution records
- runtime checkpoints and recovery
- sandboxed tools
- signed evidence records
- workflow versioning
- agent conflict resolution

## Scale — Multi-Tenant Coordination

- durable database adapters
- tenant isolation
- event-driven workers
- distributed queues
- horizontal scaling
- tracing and operational dashboards
- usage and economic metering
- exportable digital twins

## Growth — Platform and Marketplace

- reusable mission templates
- verified agent capabilities
- operator and partner workspaces
- outcome-backed marketplace assets
- licensing and enterprise controls
- measurable customer ROI

## Roadmap Gate

A roadmap item advances only when its constraint is verified, success metric is defined, owner is assigned, implementation is connected, tests pass, and proof demonstrates improvement over baseline.
`,

  "_Sidebar.md": `## CYVXAI-OS

- [Home](Home)
- [Architecture](Architecture)
- [Installation](Installation)
- [Operator Guide](Operator-Guide)
- [API Reference](API-Reference)
- [CLI Reference](CLI-Reference)
- [Spark Runtime](Spark-Runtime)
- [Kernel Specification](Kernel-Specification)
- [Coordination Platform](Coordination-Platform)
- [Intelligence Platform](Intelligence-Platform)
- [Reality Engine](Reality-Engine)
- [Security and Governance](Security-and-Governance)
- [Testing and Verification](Testing-and-Verification)
- [Deployment](Deployment)
- [Troubleshooting](Troubleshooting)
- [Contribution Standards](Contribution-Standards)
- [Product Roadmap](Product-Roadmap)
`,

  "_Footer.md": `**CYVXAI-OS** · Created by Dakota Lee Jonsgaard · © 2026 · [Repository](https://github.com/d46382015-netizen/CYVXAI-OS) · [Issues](https://github.com/d46382015-netizen/CYVXAI-OS/issues)
`,
};

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const [fileName, body] of Object.entries(pages)) {
  fs.writeFileSync(path.join(outDir, fileName), body.trim() + "\n", "utf8");
}

console.log(JSON.stringify({
  generated: Object.keys(pages).length,
  output: outDir,
  pages: Object.keys(pages),
}, null, 2));
