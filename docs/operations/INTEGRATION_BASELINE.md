# CYVXAI OS Integration Baseline v8

CYVXAI OS v8 adds credential-ready contracts for identity, tenant isolation, durable jobs, edge security, workload identity, AI observability, error tracking, product analytics, billing, and transactional email. No provider is considered integrated merely because an environment variable exists. A required integration must pass configuration validation, live probing, and deployment evidence.

## Trust path

```text
Client
  -> Cloudflare WAF / rate limits / trusted origin header
  -> CYVX public gateway
  -> Supabase Auth JWT or CYVX service API key
  -> tenant context + role + MFA assurance
  -> authorization policy
  -> integration route or legacy CYVX API
  -> managed PostgreSQL / queue / provider
  -> audit, telemetry, evidence
```

Client-supplied `x-cyvx-user-id`, `x-cyvx-tenant-id`, `x-cyvx-role`, and `x-cyvx-aal` headers are discarded. Only the verified identity gateway may populate them.

## Integration inventory

| Capability | Default provider | Runtime contract |
|---|---|---|
| Identity and MFA | Supabase Auth | OIDC JWT verification, `aal2`, trusted tenant claim |
| Authorization | CYVX policy | owner/admin/operator/developer/viewer/service roles |
| Tenant isolation | PostgreSQL RLS | membership policies and tenant-scoped records |
| Edge security | Cloudflare | WAF, rate limits, trusted origin secret |
| Durable jobs | Supabase Queues / PGMQ | enqueue, claim, acknowledge, retry and dead letter |
| Scheduling | Supabase Cron / pg_cron | integration housekeeping and flag refresh jobs |
| Feature flags | CYVX OpenFeature-compatible provider | environment and tenant targeting, kill switches |
| Infrastructure telemetry | Hosted OTLP / Grafana-compatible backend | logs, traces, metrics and alerting |
| AI observability | Langfuse OTLP | generations, tools, cost, latency and evaluation scores |
| Application errors | Sentry | redacted exception envelopes and release context |
| Product analytics | PostHog | pseudonymous IDs and property allowlist |
| Billing | Stripe | signed webhooks, subscriptions and entitlements |
| Transactional email | Resend or Postmark | verified sender and queue-backed delivery |
| Deployment identity | GitHub OIDC | short-lived identity and optional token exchange broker |

## Required flags

`CYVX_REQUIRE_INTEGRATIONS=true` requires the core launch integrations:

- Identity and explicit service tenant
- Privileged MFA
- Cloudflare origin secret
- Managed PostgreSQL
- Queue worker
- Feature flags
- Langfuse OTLP
- Sentry
- Transactional email

Paid-launch providers remain independently gated:

- `CYVX_REQUIRE_PRODUCT_ANALYTICS=true`
- `CYVX_REQUIRE_BILLING=true`
- `CYVX_REQUIRE_WORKLOAD_IDENTITY=true`

A provider may be configured without being enabled. Billing, analytics and email additionally require their runtime enable flags and their tenant feature flags.

## Identity claims

A user JWT must contain:

```json
{
  "sub": "user-uuid",
  "aud": "authenticated",
  "aal": "aal2",
  "app_metadata": {
    "tenant_id": "tenant-uuid",
    "role": "admin"
  }
}
```

Privileged changes require `aal2`. Service API-key requests are represented as the `service` role and use `CYVX_SERVICE_TENANT_ID`. A production service tenant must be an explicit UUID; wildcard service access is not accepted by production validation.

## Database migration

Apply both migrations in order:

```bash
CYVX_DATABASE_URL='postgresql://...' npm run db:migrate
```

`002_integrations.sql` creates:

- Tenants and memberships
- RLS/MFA helper functions and policies
- Feature flags
- Webhook event hashes
- Billing customers, subscriptions and entitlements
- Integration audit events
- PGMQ queues when available
- A transactional fallback queue when PGMQ is unavailable
- Cron scheduling when pg_cron is available

The service-role credential remains server-side. Browser clients use Supabase Auth and RLS, never the service-role credential.

## Feature-flag safety

High-risk capabilities default off:

- External tools
- Paid operations
- Public signup
- Billing
- Product analytics
- Transactional email

`autonomy.enabled`, `background_execution.enabled`, and `webhook_processing.enabled` are live kill switches. The autonomy supervisor checks its flag before each tick and again before each execution.

## Privacy boundaries

- Langfuse receives hashes and lengths by default, not prompt or completion content.
- PostHog receives pseudonymous user/tenant identifiers and allowlisted operational properties only.
- Sentry removes secrets, tokens, passwords, cookies, prompts, completions and email fields from extra context.
- Stripe records payload hashes and normalized summaries rather than relying on unverified client state.
- Transactional email credentials and message bodies are never written to provider-readiness snapshots.

## Cloudflare

Generate a redacted plan:

```bash
CYVX_EDGE_ORIGIN_SECRET='32+ character secret' npm run cloudflare:plan
```

Apply through the protected workflow `.github/workflows/cloudflare-edge.yml` or locally with scoped credentials:

```bash
CLOUDFLARE_API_TOKEN='...' \
CLOUDFLARE_ZONE_ID='...' \
CYVX_EDGE_ORIGIN_SECRET='...' \
npm run cloudflare:apply
```

Cloudflare must replace any client-supplied origin header with the trusted value. Render receives the same value as `CYVX_EDGE_ORIGIN_SECRET`. Render health checks use `/healthz`; readiness requires the trusted edge path.

## Workload identity

The `Workload Identity Proof` workflow requests a GitHub OIDC token with `id-token: write`. It stores only sanitized claims. When a credential broker is configured, the workflow exchanges the token for short-lived provider credentials.

```bash
npm run oidc:smoke
```

Permanent provider keys remain the fallback for services without workload-identity support. They must be independently scoped by environment and capability.

## Live verification

After deployment, run `.github/workflows/integration-smoke.yml`. The workflow proves:

- Direct liveness
- Edge-protected readiness
- Authenticated service identity
- Integration readiness
- Managed PostgreSQL connectivity
- Protected provider probing

The controlled release workflow performs the same integration checks before considering a release successful.

## Credential activation order

1. Create staging Supabase project, Auth configuration and database.
2. Apply database migrations.
3. Create tenant and owner membership with MFA.
4. Create private storage bucket and backup credentials.
5. Configure Cloudflare DNS, origin secret, WAF and rate limits.
6. Configure hosted OTLP/Grafana, Langfuse and Sentry.
7. Configure Resend or Postmark sender domain.
8. Configure PostHog and Stripe only when paid launch is ready.
9. Create protected GitHub environments and secrets.
10. Deploy staging and run integration smoke, backup and restore drills.
11. Run the controlled production release.

## Definition of done

The integration baseline is live only when:

- `npm run verify:production-baseline` passes on the immutable commit.
- Required integration configuration passes fail-closed startup.
- Database migrations and RLS policies are applied.
- Cloudflare rules and origin protection are active.
- Identity, tenant and MFA probes pass.
- Queue send/claim/ack and dead-letter evidence exists.
- Hosted infrastructure and AI telemetry receive live evidence.
- Sentry receives a controlled test exception.
- Email sender verification and test delivery pass.
- Paid-launch analytics and billing tests pass when enabled.
- Remote encrypted backup and restore drill pass.
- The controlled release workflow retains all evidence.
