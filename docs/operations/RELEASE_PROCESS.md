# CYVXAI OS Release Process

1. Merge only through a reviewed pull request with the production-baseline CI gate passing.
2. Release the immutable commit to staging through Render checks-passing auto-deploy or the staging-only `CYVX_STAGING_RENDER_DEPLOY_HOOK_URL`.
3. Verify staging health, readiness, status, managed-data sync, telemetry export, and backup execution.
4. Run the controlled release workflow with the exact commit SHA and the protected `production` GitHub environment.
5. Apply idempotent PostgreSQL migrations before triggering the environment-specific `CYVX_RENDER_DEPLOY_HOOK_URL` owned by the controlled workflow.
6. Wait for production readiness and retain health, status, database, and deployment evidence.
7. Observe error, latency, and business metrics during the release window.
8. Roll back when readiness fails, errors rise materially, or data contracts regress.
9. Publish release notes containing behavior changes, migrations, risk, rollback path, and verification evidence.

Production auto-deploy remains disabled. The legacy repository secret `RENDER_DEPLOY_HOOK_URL` must not be used because it cannot prove which environment it targets. Emergency releases follow the same verification and evidence requirements; urgency changes review priority, not safety gates.
