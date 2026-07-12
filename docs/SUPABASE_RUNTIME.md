# CYVXAI-OS Supabase Runtime

CYVXAI-OS uses Supabase as a browser-safe authentication and cloud-data integration while preserving the existing durable mission/governance runtime.

## Configured project

- Project URL: `https://yokpfcbdvszdavohibkh.supabase.co`
- Publishable key: stored in `config/public-runtime.json`
- Key type: publishable/browser-safe only
- Service-role keys are never committed or exposed by this runtime.

Environment variables override the checked-in public configuration:

```bash
export NEXT_PUBLIC_SUPABASE_URL='https://yokpfcbdvszdavohibkh.supabase.co'
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_...'
```

The equivalent non-Next variable names are also accepted:

```bash
export SUPABASE_URL='https://yokpfcbdvszdavohibkh.supabase.co'
export SUPABASE_PUBLISHABLE_KEY='sb_publishable_...'
```

## Installed packages

```text
@supabase/supabase-js 2.110.2
@supabase/ssr         0.12.0
```

Both versions are exact and integrity-locked in `package-lock.json`.

## Runtime architecture

```text
Browser / Agent Client
        |
        | GET /api/v1/runtime/public-config
        v
Supabase public client configuration
        |
        +--> @supabase/supabase-js client
        |
        +--> @supabase/ssr request cookie adapter
                  |
                  +--> refreshes authenticated Supabase sessions
                  +--> writes rotated cookies through Set-Cookie

CYVX governance bearer authentication remains independently enforced.
```

Supabase sessions do not bypass CYVX governance tokens, capability grants, Supervisor approval, Boss authorization, or the Constitution gate.

## Endpoints

### Public browser configuration

```text
GET /api/v1/runtime/public-config
```

Returns the project URL and publishable key only when both validate. The response uses `Cache-Control: no-store`.

### Public integration status

```text
GET /api/v1/runtime/supabase/status
```

Returns readiness, URL, validation state, missing fields, and a non-secret key fingerprint.

### Protected live connectivity probe

```text
GET /api/v1/integrations/supabase/probe
Authorization: Bearer <CYVX token>
```

Calls the Supabase Auth settings endpoint with a bounded timeout. The response never returns the publishable key.

## Run

```bash
cd ~/CYVXAI-OS && npm ci && npm run governance
```

Open:

```text
http://127.0.0.1:8790/governance
```

## Verify

Deterministic validation:

```bash
npm run verify:supabase
```

Live project validation:

```bash
npm run verify:supabase:live
```

Complete governed runtime validation:

```bash
npm run verify:governance
```

## Session behavior

`core/integrations/supabase-runtime.js` provides:

- Browser/server Supabase client creation
- SSR-compatible `getAll` and `setAll` cookie handling
- Session refresh only when a Supabase auth cookie exists
- No persistent server-side session storage
- No automatic privilege mapping from Supabase users to CYVX roles
- Structured logging without credentials
- Bounded live connectivity probes

## Security boundary

The publishable key is intended for browser use and relies on Supabase Row Level Security. Before exposing new tables to clients:

1. Enable RLS.
2. Deny access by default.
3. Add organization/user-scoped policies.
4. Test anonymous, authenticated, cross-tenant, and revoked-session access.
5. Keep service-role and database credentials server-only.

No database schema or RLS policy is assumed by this integration. The runtime connects safely without inventing a `todos` table or creating disconnected demonstration data.
