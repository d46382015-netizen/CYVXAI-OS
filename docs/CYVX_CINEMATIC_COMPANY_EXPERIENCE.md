# CYVXAI-OS Cinematic Company Experience

The public site and autonomous company control room are mounted directly inside the canonical CYVXAI-OS production runtime. `npm start` serves the cinematic company edge, existing mission APIs, Spark, Field Manual, universal operator, health, readiness, and control-plane behavior from one composed process.

## First company activation

Staging and production automatically activate one canonical company when it does not already exist:

- Company: `CYVX Bid & Revenue Sprint`
- Customer: commercial cleaning, landscaping, facilities, security, and small construction firms
- Offer: a 10-day evidence-backed bid and revenue sprint
- Price: `$1,500`
- Governed mission: build the complete operating package required to pursue the first `$5,000` in verified collected client revenue
- Internal target: nine completed governed revenue assets with nine hashed proof artifacts

The activation is resumable and idempotent. Startup creates the company, approves its governed mission, executes the nine-agent plan to idle, records the first measured outcome, persists a receipt under the runtime data root, and queues the Growth agent's next improvement task. A restart continues an incomplete activation without duplicating the company or outcome.

The first measured outcome is deliberately bounded to what the system can prove: nine completed internal production workstreams and nine hashed artifacts. It records verified collected customer revenue as `$0` until outside-world payment evidence exists.

`CYVX_BOOTSTRAP_FIRST_COMPANY=false` disables this behavior. `CYVX_FIRST_COMPANY_MAXIMUM_TICKS` controls the bounded execution limit.

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

## Public HTTPS proof

After the main deployment workflow succeeds, `.github/workflows/activate-first-company.yml` waits for the configured staging HTTPS endpoint and verifies:

- the cinematic public site is reachable over TLS;
- `/control-room` is reachable;
- the public company runtime API is healthy;
- `CYVX Bid & Revenue Sprint` exists;
- at least nine tasks and nine proof artifacts completed;
- at least one measured learning exists;
- collected revenue remains truthfully reported as `$0`.

The workflow writes `artifacts/company-runtime/first-company-public-activation.json` to `main` and retains the raw public status and health responses as a workflow artifact.

## Security boundaries

- Set `CYVX_COMPANY_RUNTIME_TOKEN` to a known secret of at least 32 characters for production control-room access.
- When the dedicated token is absent, the runtime derives an isolated company-control token from `CYVX_AUTH_SECRET`; the derived token is never embedded in production HTML.
- The browser stores an explicitly entered token only in local storage and sends it only as the bearer token to the current origin.
- Public status exposes sanitized aggregates, not task outputs, memory contents, integration secrets, or artifact paths.
- Public pilot intake is body-limited, field-limited, email-validated, honeypot-protected, and rate-limited.
- Webhook delivery remains allowlisted, idempotent, HMAC-signed, and dependent on a configured secret environment variable.
- HTML responses enforce CSP, frame denial, restrictive permissions policy, and same-origin opener policy.

## Run

```bash
cd ~/CYVXAI-OS && \
export CYVX_COMPANY_RUNTIME_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")" && \
CYVX_BOOTSTRAP_FIRST_COMPANY=true npm start
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
node --test test/first-company-activation.test.js test/canonical-company-gateway.test.js && \
npm test && \
npm run build
```

The focused tests prove canonical route composition, authenticated company operations, resumable creation and approval, nine-agent run-to-idle execution, durable proof artifacts, the first measured outcome, next-cycle generation, and idempotent restart behavior.
