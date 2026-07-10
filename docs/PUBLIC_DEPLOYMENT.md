# Spark + CYVX Public Deployment

The production baseline defines three deployable services in `render.yaml`:

- `cyvx-staging` — automatically deploys `main` only after required checks pass.
- `cyvx-production` — production auto-deploy is disabled and releases are triggered by the protected controlled-release workflow.
- `cyvx-status` — independently reports staging and production health at `/` and `/api/status`.

Unified application routes:

- `/` — Spark
- `/w/:slug` — operational Worlds
- `/os` — CYVX OS
- `/healthz` — liveness and dependency health
- `/readyz` — production readiness
- `/api/public/status` — product and runtime status

Deployment and operations automation:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-public.yml`
- `.github/workflows/deploy-v7.yml`
- `.github/workflows/database-migrate.yml`
- `.github/workflows/release-production-baseline.yml`
- `.github/workflows/uptime.yml`
- `.github/workflows/backup-drill.yml`
- `.github/workflows/security.yml`

See `docs/operations/PRODUCTION_BASELINE.md` for required secrets, migration, backup, telemetry, release, and verification contracts.
