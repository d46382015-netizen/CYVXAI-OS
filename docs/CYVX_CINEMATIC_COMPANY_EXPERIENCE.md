# CYVXAI-OS Cinematic Company Experience

The public site and autonomous company control room are two views over the same durable production runtime.

## Routes

| Route | Access | Production behavior |
|---|---|---|
| `/` | Public | Loads the cinematic CYVXAI-OS site and reads sanitized live runtime proof. |
| `/api/v1/company-runtime/public/status` | Public, read-only | Returns aggregated company, task, evidence, lead, revenue, and learning metrics without exposing private artifacts or tokens. |
| `/api/v1/company-runtime/public/leads` | Public, rate-limited | Validates pilot intake and writes the lead into the featured autonomous company ledger. |
| `/control-room` | Public shell; API requires bearer token | Operates governed company creation, approval, task execution, outcome measurement, integrations, and proof export. |
| `/healthz` | Public, read-only | Reports service and model-provider health. |

## Real control actions

The control room buttons are connected to production endpoints:

- Create company → `POST /api/v1/company-runtime/companies`
- Approve mission → `POST /api/v1/company-runtime/companies/:id/approve`
- Run one tick → `POST /api/v1/company-runtime/companies/:id/tick`
- Run to idle → `POST /api/v1/company-runtime/companies/:id/run`
- Queue bounded task → `POST /api/v1/company-runtime/companies/:id/tasks`
- Record measured outcome → `POST /api/v1/company-runtime/companies/:id/outcomes`
- Register webhook → `POST /api/v1/company-runtime/companies/:id/integrations`
- Dispatch signed event → `POST /api/v1/company-runtime/companies/:id/integrations/:integrationId/dispatch`
- Export proof JSON → downloads the complete currently loaded company graph from the authenticated API response.

## Security boundaries

- Production requires `CYVX_COMPANY_RUNTIME_TOKEN` with at least 32 characters.
- The browser stores the token only in local storage and sends it only as the bearer token to the current origin.
- Public status exposes sanitized aggregates, not task outputs, memory contents, integration secrets, or artifact paths.
- Public pilot intake is body-limited, field-limited, email-validated, honeypot-protected, and rate-limited.
- Webhook delivery remains allowlisted, idempotent, HMAC-signed, and dependent on a configured secret environment variable.
- HTML responses enforce CSP, frame denial, restrictive permissions policy, and same-origin opener policy.

## Run

```bash
cd ~/CYVXAI-OS && \
export CYVX_COMPANY_RUNTIME_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")" && \
npm run company:runtime
```

Open:

- Public site: `http://127.0.0.1:3030/`
- Control room: `http://127.0.0.1:3030/control-room`

## Verify

```bash
cd ~/CYVXAI-OS && \
npm run company:runtime:verify
```

The verification proves that the public status reflects completed task artifacts and that the public pilot form increments the real company lead counter and outcome contract.
