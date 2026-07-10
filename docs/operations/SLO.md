# CYVXAI OS Service-Level Objectives

## Production objectives

| SLI | Objective | Measurement |
|---|---:|---|
| Public availability | 99.9% per calendar month | Successful `/healthz` and `/readyz` probes |
| Ready-response latency | 95% below 2 seconds | External uptime-check latency |
| API server errors | Below 1% over 30 minutes | 5xx responses divided by total requests |
| Managed data freshness | Snapshot no older than 5 minutes | `managed_data.last_sync_at` |
| Backup freshness | Successful encrypted backup no older than 8 hours | `cyvx_backup_last_success_timestamp_seconds` |
| Recovery point objective | 6 hours | Backup schedule and latest verified object |
| Recovery time objective | 60 minutes | Incident timeline from declaration to restored readiness |
| Restore proof | One successful remote restore drill per month | GitHub restore-drill artifact |

## Error budget

A 99.9% monthly availability objective permits approximately 43 minutes of unavailable time in a 30-day month. When more than half of the monthly error budget is consumed, pause non-essential production releases. When the full error budget is consumed, release only security, reliability, and recovery changes until the rolling objective is restored.

## Alert mapping

- Immediate critical alert: service down, backup failure, backup older than eight hours, or managed data unavailable.
- Warning alert: readiness below 90, rising runtime errors, repeated autonomy failures, or approval backlog.
- Every alert must identify the service, environment, current value, threshold, and incident runbook.

## Review

Review SLO performance after every SEV-1/SEV-2 incident and monthly during the release review. Change targets only with evidence; never lower an objective solely to hide poor performance.
