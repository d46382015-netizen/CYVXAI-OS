# CYVX Vault Runbook

## Start / stop

Start with `./run.sh`. Stop with Ctrl+C; the process handles SIGINT/SIGTERM and closes SQLite cleanly.

## Health

`GET /api/health` returns service state and verifies the full audit hash chain.

## Inventory workflow

1. Sign in as the bootstrap operator.
2. Register real inventory with unique SKU, category, cost, value, grade/certificate, and image evidence.
3. Create a draft pack from currently unassigned in-stock inventory in one category.
4. Review the complete pool and publish it. Publication is irreversible in this release.
5. A closed pack exposes its original server seed for receipt verification.

## Incident controls

- Keep `PAID_PACKS_ENABLED=false` to stop new card-funded purchases while preserving vault access.
- Preserve the SQLite database and logs before investigation.
- Run `./verify.sh` and retain `/api/health` output as evidence.

## Current deployment boundary

SQLite is correct for a single-process launch node. Before horizontal scaling, migrate the same transaction and append-only contracts to PostgreSQL, replace in-memory rate limiting with a shared limiter, move images to object storage, and add a queue for fulfillment and reconciliation.
