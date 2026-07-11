# Mission Workflow Architecture

## Overview

CYVXAI-OS implements a complete mission lifecycle with enforced state machine, approval gates, agent assignment, evidence capture, and learning promotion.

## State Machine

```
draft
  ↓
validated
  ↓
planned
  ↓
awaiting_approval
  ↓
approved
  ↓
queued
  ↓
running ↔ paused | blocked
  ↓
completed | failed | cancelled
  ↓
evaluated
  ↓
learned
```

## Workflow Stages

### 1. Creation (Draft)
- Title, objective, constraints, opportunities, success metrics
- Approval requirement flag
- Created with initial audit trail
- Event: `mission.created`

### 2. Validation
- Feasibility assessment
- Blocker and assumption capture
- State transition: draft → validated
- Event: `mission.validated`

### 3. Planning
- Action sequence definition
- Dependency mapping
- Resource estimation
- State transition: validated → planned
- Event: `mission.planned`

### 4. Approval Request
- Approval record creation
- Deadline specification
- State transition: planned → awaiting_approval
- Event: `approval.requested`

### 5. Approval Decision
- Approver decision (approved/rejected)
- Decision reason capture
- Approval audit trail
- State transition: awaiting_approval → approved or cancelled
- Event: `approval.approved` or `approval.rejected`

### 6. Agent Assignment
- Agent binding to mission
- Assignment record creation
- State transition: approved → queued
- Event: `mission.assigned`

### 7. Execution
- Mission processing by assigned agent
- Step-by-step execution
- State transitions: queued → running
- Event: `mission.running`

### 8. Evidence Recording
- Artifact capture during execution
- SHA256 hash computation
- Chain hash linking
- Tamper-proof ledger
- Event: `evidence.recorded`

### 9. Completion or Failure
- Outcome recording
- Result summary and metrics
- Verification status
- State transition: running → completed or failed
- Event: `mission.completed` or `mission.failed`

### 10. Evaluation
- Success assessment
- Lessons learned capture
- Improvements identification
- Capability delta calculation
- State transition: completed/failed/cancelled → evaluated
- Event: `mission.evaluated`

### 11. Learning and Capability
- Successful patterns promoted to reusable capabilities
- Versioning and ownership
- Test requirements
- Cost basis tracking
- State transition: evaluated → learned
- Event: `capability.learned`

## API Endpoints

### Mission Management
- `POST /api/v1/missions` - Create mission
- `GET /api/v1/missions/:id` - Get mission graph
- `POST /api/v1/missions/:id/validate` - Validate mission
- `POST /api/v1/missions/:id/plan` - Plan mission
- `POST /api/v1/missions/:id/approval-request` - Request approval
- `POST /api/v1/missions/:id/assign-agent` - Assign agent
- `POST /api/v1/missions/:id/execute` - Execute mission
- `POST /api/v1/missions/:id/complete` - Complete mission
- `POST /api/v1/missions/:id/fail` - Fail mission
- `POST /api/v1/missions/:id/evaluate` - Evaluate mission
- `POST /api/v1/missions/:id/learn-capability` - Learn capability

### Approval Management
- `POST /api/v1/approvals/:id/decide` - Approve or reject

### Evidence Management
- `POST /api/v1/missions/:id/evidence` - Record evidence

## Audit Trail

Every mission maintains an immutable audit trail:
- Timestamp
- State (before/after)
- Actor (user/system/agent)
- Reason for transition

## Events

All major operations emit typed events:
- `mission.*` - Mission lifecycle events
- `approval.*` - Approval decision events
- `evidence.*` - Evidence recording events
- `outcome.*` - Outcome events
- `capability.*` - Capability learning events

Events include:
- Correlation ID (for tracing)
- Causation ID (for event chains)
- Organization ID (for multi-tenancy)
- Timestamp
- Actor
- Data payload

## Authorization

- Organization isolation enforced
- Role-based capability authorization
- Approval required for high-impact states
- Audit logging of all authorization decisions

## Storage

All state persisted in SQLite:
- Missions
- Approvals
- Assignments
- Evidence (tamper-proof ledger)
- Outcomes
- Capabilities
- Events (for event sourcing)
- Audit logs

## Testing

Run the complete workflow test:
```bash
bash scripts/test-integration.sh
```

Run unit tests:
```bash
node test/mission-workflow.test.js
```
