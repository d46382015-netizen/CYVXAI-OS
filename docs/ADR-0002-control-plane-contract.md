# ADR 0002: Control Plane Contract

Date: 2026-05-23
Status: Accepted

## Context
CYVX needs a stable contract for node health, workload placement, roadmap state, failure drills, and recovery timelines.

## Decision
Expose the control plane through versioned JSON APIs and a dashboard that reads from the same controller state.

## Guarantees
- Responses include `powered_by`, `creator`, `version`, and `timestamp`.
- Recovery and failure endpoints must be replay-safe.
- Control-plane state must be serializable without recursive snapshot growth.

