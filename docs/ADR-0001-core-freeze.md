# ADR 0001: Freeze Core Architecture

Date: 2026-05-23
Status: Accepted

## Context
CYVX has multiple runtime planes, control APIs, UI surfaces, and failure-recovery behaviors. Unbounded expansion increases operational burden and weakens correctness.

## Decision
Freeze the core architecture around a stable control plane, deterministic recovery flow, and versioned public interfaces.

## Consequences
- New work must improve correctness, reliability, observability, security, or recovery.
- Public API changes require versioning or compatibility notes.
- Major architectural changes require an ADR before implementation.

