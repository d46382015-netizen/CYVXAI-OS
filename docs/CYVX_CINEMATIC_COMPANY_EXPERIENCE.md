# CYVXAI-OS Cinematic Company Experience

The public site and autonomous company control room are now mounted directly inside the canonical CYVXAI-OS production runtime. `npm start` serves the cinematic company edge, existing mission APIs, Spark, Field Manual, universal operator, health, readiness, and control-plane behavior from one composed process.

## Routes

| Route | Access | Production behavior |
|---|---|---|
| `/` | Public | Loads the cinematic CYVXAI-OS site and reads sanitized live company proof. |
| `/api/v1/company-runtime/public/status` | Public, read-only | Returns aggregated company, task, evidence, lead, revenue, and learning metrics without exposing private artifacts or tokens. |
| `/api/v1/company-runtime/public/leads` | Public, rate-limited | Validates pilot intake and writes the lead into the featured autonomous company ledger. |
| `/control-room` and `/control` | Public shell; API requires bearer token | Operates governed company creation, approval, task execution, outcome measurement, integrations, and proof export. |
| `/missions` | Authenticated mission surface | Preserves the durable mission runtime and evidence ledger. |
| `/spark` | Public Spark surface | Preserves the world factory and its production API routes. |
| `/field-manual` | Public acquisition surface | Preserves the Field Manual content and lead system. |
| `/healthz` and `/readyz` | Public, read-only | Report composed runtime health and dependency readiness. |

## Real control actions

The control room buttons call production endpoints on the same origin:

- Create company → `POST /api/v1/company-runtime/companies`
- Approve mission → `POST /api/v1/company-runtime/companies/:id/approve`
- Run one tick → `POST /api/v1/company-runtime/companies/:id/tick`
- Run to idle → `POST /api/v1/company-runtime/companies/:id/run`
- Queue bounded task → `POST /api/v1/company-runtime/companies/:id/tasks`
- Record measured outcome → `POST /api/v1/company-runtime/companies/:id/outcomes`
- Register webhook → `POST /api/v1/company-runtime/companies/:id/integrations`
- Dispatch signed event → `POST /api/v1/company-runtime/companies/:id/integrations/:integrationId/dispatch`
- Export proof JSON → downloads the complete currently loaded company graph from the authenticated API response.

The canonical runtime also runs the autonomous company scheduler. Active companies are advanced on the configured interval unless `CYVX_COMPANY_RUNTIME_AUTO_TICK=false`.

## Security boundaries

- Set `CYVX_COMPANY_RUNTIME_TOKEN` to a known secret of at least 32 characters for production control-room access.
- When the dedicated token is absent, the runtime derives an isolated company-control token from `CYVX_AUTH_SECRET` so startup remains secure and deterministic; the derived token is never embedded in production HTML.
- The browser stores an explicitly entered token only in local storage and sends it only as the bearer token to the current origin.
- Public status exposes sanitized aggregates, not task outputs, memory contents, integration secrets, or artifact paths.
- Public pilot intake is body-limited, field-limited, email-validated, honeypot-protected, and rate-limited.
- Webhook delivery remains allowlisted, idempotent, HMAC-signed, and dependent on a configured secret environment variable.
- HTML responses enforce CSP, frame denial, restrictive permissions policy, and same-origin opener policy.

## Run

```bash
cd ~/CYVXAI-OS && \
export CYVX_COMPANY_RUNTIME_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")" && \
npm start
```

Open:

- Public site: `http://127.0.0.1:3000/`
- Control room: `http://127.0.0.1:3000/control-room`
- Durable missions: `http://127.0.0.1:3000/missions`
- Spark: `http://127.0.0.1:3000/spark`
- Field Manual: `http://127.0.0.1:3000/field-manual`

## Verify

```bash
cd ~/CYVXAI-OS && \
npm run company:runtime:verify && \
node --test test/canonical-company-gateway.test.js && \
npm test && \
npm run build
```

The focused canonical gateway test proves that `/`, `/control-room`, `/control`, protected company mutations, approval, run-to-idle, public proof, the existing public status API, and Spark all operate through the same production listener.
