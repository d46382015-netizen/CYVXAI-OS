# CYVXAI OS Production Baseline v7.1

This baseline converts CYVXAI OS from an advanced single-node product into an operated production capability with explicit security, durable managed data, encrypted recovery, observability, and controlled releases.

## Runtime topology

| Capability | Staging | Production | Evidence |
|---|---|---|---|
| Application | `cyvx-staging` | `cyvx-production` | `/healthz`, `/readyz`, `/api/public/status` |
| Operations plane | loopback control port | loopback control port | `/api/control-plane`, `/metrics` |
| Managed data | PostgREST-backed PostgreSQL | PostgREST-backed PostgreSQL | `cyvx_runtime_snapshots`, `cyvx_health()` |
| Operational disk | isolated persistent disk | isolated persistent disk | file state plus managed snapshots |
| Backups | encrypted remote object storage | encrypted remote object storage | `.cyvxbak`, status file, restore drill artifacts |
| Public status | `cyvx-status` | `cyvx-status` | `/api/status` |
| Telemetry | OTLP + JSON logs | OTLP + JSON logs | hosted traces/logs and Prometheus metrics |
| Releases | automatic after passing checks | manually approved workflow | GitHub environment and retained artifacts |

The runtime remains one process per environment while local state is still used for immediate operation. Managed PostgreSQL receives recurring production snapshots, incidents, audit records, backup manifests, and SLO measurements. Horizontal scaling remains blocked until every mutable domain object uses a shared transactional store and rate limiting is shared.

## Security contract

Production startup is rejected unless all required controls pass:

- `CYVX_API_KEY` is a non-placeholder secret with at least 32 characters.
- `CYVX_OWNER_ID` and `CYVX_OPERATOR_SESSION_SECRET` are configured.
- `APP_BASE_URL` uses HTTPS.
- `CYVX_ALLOW_INSECURE_LOCAL` is false.
- Managed PostgreSQL is configured when `CYVX_REQUIRE_MANAGED_DATA=true`.
- Encrypted object storage is configured when `CYVX_BACKUP_ENABLED=true`.

Local unauthenticated operation requires both a non-production environment and the explicit `CYVX_ALLOW_INSECURE_LOCAL=true` flag.

## Data and migrations

Apply every migration in lexical order:

```bash
CYVX_DATABASE_URL='postgresql://...' npm run db:migrate
```

`ops/postgres/001_production_baseline.sql` is idempotent and creates:

- Runtime snapshots
- Incident records
- Backup manifests
- Append-only audit events
- SLO measurements
- A database health function

The production service uses the service-role credential only on the server. Never expose it to browser code.

## Encrypted backups

Backups run inside the application process on the configured interval. Each backup:

1. Traverses the operational data root while excluding backup output, locks, temporary files, symlinks, and dependencies.
2. Hashes every file and the complete manifest.
3. Compresses the archive.
4. Encrypts it with AES-256-GCM using a scrypt-derived key, unique salt, and unique nonce.
5. Writes atomically with owner-only permissions.
6. Uploads to managed object storage.
7. Prunes local and remote backups according to retention policy.
8. Exposes success, age, size, and failure metrics.

Local proof:

```bash
npm run backup:verify
```

Production recovery proof is performed monthly by `.github/workflows/backup-drill.yml`, which downloads, authenticates, decrypts, and restores the newest production backup into an isolated runner.

## Observability

The runtime provides:

- Structured JSON logs with secret redaction and bounded file rotation
- OTLP/HTTP trace and log export
- Error webhook delivery
- W3C-compatible trace identifiers
- Prometheus metrics at the loopback operations plane
- Hosted alert rules in `ops/prometheus/alerts.yml`
- Five-minute external uptime checks
- A separately deployed status service

Configure hosted telemetry with `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS`. Configure incident delivery with `CYVX_ERROR_WEBHOOK_URL` and `CYVX_INCIDENT_WEBHOOK_URL`.

## Environments

Staging automatically deploys only after repository checks pass. Production auto-deploy is disabled. Production changes are released through `.github/workflows/release-production-baseline.yml` and should use a protected GitHub environment with required reviewer approval.

Environment-level GitHub secrets:

- `CYVX_DATABASE_URL`
- `CYVX_RENDER_DEPLOY_HOOK_URL`
- `CYVX_RELEASE_URL`

Repository-level monitoring secrets:

- `CYVX_STAGING_URL`
- `CYVX_PRODUCTION_URL`
- `CYVX_INCIDENT_WEBHOOK_URL`
- `CYVX_BACKUP_STORAGE_URL`
- `CYVX_BACKUP_STORAGE_TOKEN`
- `CYVX_BACKUP_BUCKET`
- `CYVX_BACKUP_ENCRYPTION_KEY`

## Verification

```bash
npm ci --no-audit --no-fund && npm run verify:production-baseline
```

The gate validates repository structure, fail-closed security, unit and integration tests, UI/build contracts, encrypted restore behavior, and compatibility runtimes.

## Production definition of done

A release is production-capable only when:

- CI is green on the immutable release commit.
- Database migrations pass and `cyvx_health()` returns successfully.
- Staging smoke tests pass.
- Production deployment is manually approved.
- `/healthz`, `/readyz`, and `/api/public/status` pass after deployment.
- Hosted logs, metrics, traces, alerts, and incident webhooks receive live evidence.
- A remote encrypted backup exists.
- The scheduled restore drill has successfully restored a remote backup.
- The status page reports both environments.
