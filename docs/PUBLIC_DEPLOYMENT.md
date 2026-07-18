# Spark + CYVX Public Deployment

The production baseline defines three deployable services in `render.yaml`:

- `cyvx-staging` — automatically deploys `main` only after required checks pass.
- `cyvx-production` — production auto-deploy is disabled and releases are triggered by the protected controlled-release workflow.
- `cyvx-status` — independently reports staging and production health at `/` and `/api/status`.

Unified application routes:

- `/` — Spark
- `/w/:slug` — operational Worlds
- `/os` — CYVX OS
- `/field-manual` — CYVX Field Manual opt-in and product portal
- `/field-manual/health` — Field Manual runtime and sanitized provider readiness
- `/field-manual/api/v1/posts` — publication-ready post catalog
- `/field-manual/api/v1/webhooks/manychat` — authenticated ManyChat lead ingestion
- `/field-manual/api/v1/webhooks/lemonsqueezy` — signed Lemon Squeezy revenue ingestion
- `/healthz` — liveness and dependency health
- `/readyz` — production readiness
- `/api/public/status` — product and runtime status

Field Manual state is stored under `${CYVX_DATA_ROOT}/field-manual` by default, which resolves to the attached Render persistent disk in staging and production.

Required Field Manual provider variables:

- `CYVX_FIELD_ADMIN_TOKEN`
- `CYVX_MANYCHAT_WEBHOOK_SECRET`
- `KIT_API_KEY`
- `KIT_TAG_GENERAL_OPERATOR`
- `KIT_TAG_SECURITY`
- `KIT_TAG_MOBILE_BUILD`
- `LEMONSQUEEZY_CHECKOUT_URL`
- `LEMONSQUEEZY_WEBHOOK_SECRET`

These values must be configured as provider secrets and must never be committed to the repository. Missing ManyChat or admin secrets fail closed. Public landing-page opt-ins remain available, while Kit synchronization is skipped and reported when no Kit key is configured.

Deployment and operations automation:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-public.yml`
- `.github/workflows/deploy-v7.yml`
- `.github/workflows/database-migrate.yml`
- `.github/workflows/release-production-baseline.yml`
- `.github/workflows/uptime.yml`
- `.github/workflows/backup-drill.yml`
- `.github/workflows/security.yml`

The `deploy-v7.yml` workflow waits for the public Field Manual route after a staging release, captures one unique `MANUAL` test lead, verifies `GENERAL_OPERATOR` routing, and downloads the Operator Readiness Assessment as deployment evidence.

See `docs/operations/PRODUCTION_BASELINE.md` and `docs/FIELD_MANUAL.md` for required secrets, migration, backup, telemetry, release, content, and verification contracts.
