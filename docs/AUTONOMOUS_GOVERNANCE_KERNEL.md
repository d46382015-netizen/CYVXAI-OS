# CYVX Autonomous Governance Kernel

The governance kernel converts routine human approval into a two-key autonomous control pipeline while preserving accountable human exceptions for actions that cannot safely or legally be delegated.

## Runtime flow

```text
Worker submission
  → deterministic completeness checks
  → Supervisor review and signature
  → Boss review and signature
  → immutable Constitution evaluation
  → expiring capability grant
  → executor consumes the grant
  → cost and outcome receipt
  → hash-chained governance event
```

The Supervisor and Boss are separate governance identities. Neither may be the Worker, and the Boss may not be the Supervisor. A signed approval does not directly execute anything: the deterministic policy gate evaluates risk, evidence, tests, rollback, emergency controls, prohibited actions, and budget before issuing a scoped grant.

## What is autonomous

Risk tiers 0–2 may be authorized when they remain inside the active Constitution. Examples include internal analysis, branch changes, staging deployments, approved automation, and bounded infrastructure use.

Tier 3 and Constitution-prohibited actions enter `human_exception`. The default list includes contracts, borrowing, tax filings, legal representation, regulated eligibility decisions, governance changes, security ownership changes, credential export, and irreversible deletion.

This system enforces encoded policy; it does not make a legal guarantee. Jurisdiction-specific legal requirements still need to be encoded and reviewed by an accountable person or qualified professional.

## Services and storage

- `core/governance/kernel.js`: validation, signatures, policy gate, grants, budgets, controls, and ledger verification.
- `api/governance.js`: authenticated HTTP API sharing the CYVX mission database.
- `ui/governance.html`: mobile-ready control center.
- `ops/sqlite/003_autonomous_governance.sql`: persistent governance schema.
- `test/governance-kernel.test.js`: end-to-end kernel tests.
- `run-governance.sh`: UserLAnd-compatible runtime entry point.

The kernel shares `~/.cyvx/mission-runtime.db` with the mission runtime. SQLite WAL mode provides durable local concurrency without Docker or systemd.

## Local identities

The bootstrap creates two governance identities in the existing authentication system:

| User ID | Existing auth role | Governance identity |
|---|---|---|
| `supervisor-local` | `approver` | Supervisor |
| `boss-local` | `admin` | Boss |

`agent-local` is the default Worker identity. Governance identity is independently checked in `governance_principals`, so an ordinary approver is not automatically a Supervisor and an ordinary administrator is not automatically the Boss.

## Run

```bash
cd ~/CYVXAI-OS && npm run governance
```

Open `http://127.0.0.1:8790/governance`.

Issue local development tokens:

```bash
curl -sS -X POST http://127.0.0.1:8790/api/v1/auth/token \
  -H 'content-type: application/json' \
  -d '{"user_id":"agent-local","organization_id":"default"}'
```

Repeat with `supervisor-local` and `boss-local`. Production mode requires the normal CYVX authentication secret and disables local issuance unless explicitly enabled.

## API sequence

Submit work with the Worker token:

```bash
curl -sS -X POST http://127.0.0.1:8790/api/v1/governance/packages \
  -H "authorization: Bearer $WORKER_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "mission_id":"mission_...",
    "requested_action":"deploy_staging",
    "risk_tier":1,
    "artifact_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "evidence_ids":["evidence_..."],
    "tests":[{"name":"acceptance","status":"passed","evidence_id":"evidence_..."}],
    "rollback_plan":{"procedure":"restore previous release","verification":"health check passes"},
    "estimated_cost_usd":2
  }'
```

Supervisor review:

```bash
curl -sS -X POST http://127.0.0.1:8790/api/v1/governance/packages/$PACKAGE_ID/supervisor-review \
  -H "authorization: Bearer $SUPERVISOR_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"decision":"approved","reason":"Tests, evidence, security, and rollback checks passed"}'
```

Boss authorization:

```bash
curl -sS -X POST http://127.0.0.1:8790/api/v1/governance/packages/$PACKAGE_ID/boss-review \
  -H "authorization: Bearer $BOSS_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"decision":"authorize","reason":"Mission value, cost, and risk are within authority"}'
```

The successful response contains an expiring `grant`. The executor must consume it and attach a receipt:

```bash
curl -sS -X POST http://127.0.0.1:8790/api/v1/governance/grants/$GRANT_ID/consume \
  -H "authorization: Bearer $WORKER_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"actual_cost_usd":1.50,"external_reference":"deployment-42","outcome":"Health checks passed"}'
```

## Emergency controls

With the Boss token:

```bash
curl -sS -X POST http://127.0.0.1:8790/api/v1/governance/controls \
  -H "authorization: Bearer $BOSS_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"global_stop":true,"reason":"Incident containment"}'
```

A global stop or external-action stop revokes every active grant. Spending and agent creation can be frozen independently.

## Verify

```bash
cd ~/CYVXAI-OS && npm run verify:governance
```

The verifier checks required artifacts, JavaScript syntax, the two-key workflow, separation of duties, deterministic rejection, human exceptions, kill-switch behavior, budget accounting, and hash-chain integrity.
