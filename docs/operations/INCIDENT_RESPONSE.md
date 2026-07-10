# CYVXAI OS Incident Response

## Severity

- **SEV-1:** Production unavailable, data integrity risk, credential exposure, unauthorized action, or failed recovery.
- **SEV-2:** Material degradation, repeated automation failures, stale backups, or managed PostgreSQL unavailable.
- **SEV-3:** Non-critical defect with a workaround and no current data or security risk.

## First response

1. Acknowledge the alert and record the start time, environment, affected endpoints, deployment SHA, and operator.
2. Stop unsafe execution. Set `CYVX_AUTONOMY=0` or place the service in maintenance mode when actions could worsen impact.
3. Preserve evidence: runtime logs, control-plane snapshot, health responses, recent deployment information, and backup status.
4. Determine whether the incident involves availability, security, data integrity, a dependency, or a release regression.
5. Assign one incident commander. All production changes flow through that person until resolution.

## Immediate evidence

```bash
curl -fsS "$CYVX_RELEASE_URL/healthz"
curl -fsS "$CYVX_RELEASE_URL/readyz"
curl -fsS "$CYVX_RELEASE_URL/api/public/status"
curl -fsS "http://127.0.0.1:${CYVX_CONTROL_PORT:-3004}/api/control-plane"
curl -fsS "http://127.0.0.1:${CYVX_CONTROL_PORT:-3004}/metrics"
```

## Containment

- Revoke or rotate exposed secrets immediately.
- Disable autonomy for incorrect or unsafe execution.
- Disable paid operations or external integrations independently when possible.
- Do not delete logs, state, failed deliveries, or backup artifacts during investigation.
- Roll back to the most recent verified commit when the incident began after a release.

## Recovery

Verify a backup without modifying production:

```bash
CYVX_BACKUP_ENCRYPTION_KEY='...' npm run restore -- --input /path/to/backup.cyvxbak --verify
```

Restore into an isolated location first:

```bash
CYVX_BACKUP_ENCRYPTION_KEY='...' npm run restore -- --input /path/to/backup.cyvxbak --target /tmp/cyvx-recovery --force
```

Compare restored state, hashes, counts, and critical records before replacing any production data. A restore is not successful merely because decryption completed; the application must boot against the recovered data and pass health, readiness, workflow, and integrity checks.

## Resolution

An incident can move to monitoring only when:

- The unsafe condition is contained.
- Health and readiness remain successful.
- Error and latency metrics return to baseline.
- Managed PostgreSQL synchronization succeeds.
- Backup execution is current.
- A customer-facing update is posted when impact was externally visible.

## Post-incident requirements

Within two business days, record:

- Timeline
- Customer and system impact
- Root cause and contributing conditions
- Detection gap
- Recovery evidence
- Corrective actions with owners and deadlines
- Tests and alerts added to prevent recurrence

Corrective work is complete only after it is merged, released, and measured in production.
