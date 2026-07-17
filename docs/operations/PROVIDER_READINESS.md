# Provider Readiness

CYVX separates repository correctness from external-provider provisioning. Builds, tests, local cryptographic recovery, and source integrity must pass without private credentials. Remote deployment, production restore, uptime monitoring, billing, email, Cloudflare, and Supabase mutation activate only when their required credentials exist.

Run the redacted readiness report:

```bash
npm run provider:readiness
```

No secret values are printed or persisted. The report contains only provider names and missing environment-variable names.

## Required provider configuration

- Backup restore drill: `CYVX_BACKUP_STORAGE_URL`, `CYVX_BACKUP_STORAGE_TOKEN`, `CYVX_BACKUP_BUCKET`, `CYVX_BACKUP_ENCRYPTION_KEY`.
- Uptime monitor: at least one of `CYVX_PRODUCTION_URL`, `CYVX_STAGING_URL`, or `CYVX_UPTIME_TARGETS`. `CYVX_INCIDENT_WEBHOOK_URL` is optional.
- Staging deployment hook: `CYVX_STAGING_RENDER_DEPLOY_HOOK_URL`.
- Cloudflare apply: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CYVX_EDGE_ORIGIN_SECRET`.
- Supabase schema deployment: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`.
- Production canary: `SUPABASE_SECRET_KEY`, `CYVX_OWNER_EMAIL`, `CYVX_OWNER_PASSWORD`.
- Stripe: `STRIPE_SECRET_KEY`, `CYVX_STRIPE_WEBHOOK_SECRET`.
- Transactional email: `CYVX_EMAIL_FROM` and either `RESEND_API_KEY` or `POSTMARK_SERVER_TOKEN`.

## Workflow behavior

Scheduled workflows never report repository failure merely because an external provider is unprovisioned. They retain a redacted readiness artifact and execute local verification. Manual strict operations still fail when required credentials are absent. Invalid configured credentials and real provider outages remain failures.
