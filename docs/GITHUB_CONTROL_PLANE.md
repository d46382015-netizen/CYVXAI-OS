# CYVX GitHub App Control Plane

CYVX turns authenticated GitHub activity into durable reality objects while preserving the existing API and WebSocket runtime behind a loopback-only production gateway.

## Production architecture

`npm start` launches `api/production.js`.

The gateway:

1. serves the public HTTP and WebSocket entry point;
2. keeps the existing CYVX API on a loopback-only internal port;
3. verifies GitHub webhook signatures from the exact raw request bytes;
4. stores accepted delivery IDs before processing;
5. returns HTTP 202 promptly and processes deliveries asynchronously;
6. prevents duplicate delivery IDs from producing duplicate CYVX objects;
7. supports controlled retries with an attempt limit;
8. creates GitHub App JWTs and short-lived installation tokens;
9. signs one-time OAuth state and rejects expiration, replay, and tampering;
10. encrypts persisted GitHub user tokens with AES-256-GCM;
11. exposes a secure owner interface for connection status, deliveries, retries, disconnect, and readiness.

## Required Render secrets and variables

```text
APP_BASE_URL=https://cyvxai-os.onrender.com
CYVX_API_KEY=<strong random operator key>
CYVX_OWNER_ID=dakota
CYVX_OPERATOR_SESSION_SECRET=<at least 32 random characters>
CYVX_REQUIRE_GITHUB_APP=true

GITHUB_APP_ID=3853563
GITHUB_APP_SLUG=<GitHub App URL slug>
GITHUB_CLIENT_ID=Iv23lieBU1HBubq5cv03
GITHUB_CLIENT_SECRET=<secret>
GITHUB_PRIVATE_KEY_PEM=<complete private-key PEM>
GITHUB_WEBHOOK_SECRET=<secret>
GITHUB_OAUTH_STATE_SECRET=<at least 32 random characters>
GITHUB_TOKEN_ENCRYPTION_KEY=<at least 32 random characters or a 32-byte key>

CYVX_PLATFORM_STATE=/var/data/cyvx/platform-state.json
CYVX_GITHUB_WEBHOOK_STORE=/var/data/cyvx/github-webhooks.json
CYVX_GITHUB_AUTH_STORE=/var/data/cyvx/github-auth.json
CYVX_GITHUB_WEBHOOK_MAX_BYTES=1000000
CYVX_GITHUB_WEBHOOK_MAX_ATTEMPTS=5
CYVX_INTERNAL_PORT=3001
```

Use a Render persistent disk mounted at `/var/data`. Never commit secret values, private-key material, OAuth tokens, webhook payloads, or encrypted credential records.

`GITHUB_PRIVATE_KEY_PEM` accepts a multiline PEM or a value containing escaped `\n` newlines.

## GitHub App settings

```text
Homepage URL:
https://cyvxai-os.onrender.com

Callback URL:
https://cyvxai-os.onrender.com/api/github/oauth/callback

Webhook URL after deployment verification:
https://cyvxai-os.onrender.com/api/github/webhook

Request user authorization during installation:
Enabled

Setup URL:
Blank

Device Flow:
Disabled

SSL verification:
Enabled
```

Keep the current webhook URL unchanged until the deployed health endpoint reports every readiness field as true.

## Permissions and subscribed events

Use least privilege.

Repository permissions:

- Metadata: read
- Contents: read; write only when CYVX execution requires repository changes
- Issues: read/write
- Pull requests: read/write
- Actions: read
- Checks: read
- Commit statuses: read

Subscribe to:

- Ping
- Installation
- Installation repositories
- Push
- Issues
- Issue comments
- Pull requests
- Pull request reviews
- Workflow runs
- Check suites
- Check runs

Do not request organization administration, secrets, members, environments, packages, or workflow-write permissions unless a reviewed capability requires them.

## Routes

Public signed ingestion:

- `POST /api/github/webhook`

Owner session:

- `GET /api/session/operator`
- `POST /api/session/operator` with `CYVX_API_KEY`
- `DELETE /api/session/operator`

GitHub connection:

- `GET /api/github/install`
- `GET /api/github/oauth/callback`
- `GET /api/github/installations`
- `DELETE /api/github/installations/:id`

Operations:

- `GET /api/github/status`
- `GET /api/github/deliveries`
- `POST /api/github/deliveries/:id/retry`
- `GET /api/github/control-plane/health`

Browser management uses a signed, expiring, HttpOnly, SameSite=Lax owner cookie. The cookie is marked Secure on HTTPS. An arbitrary `X-CYVX-User-ID` header does not grant management access.

## CYVX mapping

- App installation → Capability
- Repository-selection change → Capability
- Push → Observation
- Opened, reopened, synchronized, or review-ready PR → Mission
- Merged PR → Outcome
- Closed unmerged PR → Observation
- Open or updated issue → Constraint
- Closed issue → Outcome
- PR review or issue comment → Decision
- Failed workflow or check → Constraint
- Successful workflow or check → verified Observation

Each record retains delivery ID, event/action, installation, repository, actor, source URL/object ID, commit SHA, provenance, confidence, and timestamp.

## Owner interface

The CYVX dashboard includes a GitHub Reality Connection panel that displays only real API state:

- configuration readiness;
- owner-session state;
- connected GitHub identity;
- installation state;
- repository authentication mode;
- accepted, processing, completed, and failed deliveries;
- mapped CYVX object types;
- controlled retry and disconnect actions.

The operator API key is sent once over HTTPS to create the owner session and is not stored by the page.

## Verification

```bash
npm test
npm run build
node --check api/production.js
node --test test/github-control-plane.test.js test/github-control-plane-advanced.test.js
curl -fsS https://cyvxai-os.onrender.com/api/github/control-plane/health
```

Expected deployment order:

1. merge only after CI passes;
2. configure Render secrets and persistent storage;
3. deploy;
4. confirm the health endpoint is operational and readiness is true;
5. configure the callback URL;
6. switch the webhook URL;
7. send a GitHub ping;
8. install/authorize the app;
9. create a test issue or branch push;
10. confirm one durable delivery and one mapped CYVX object;
11. redeliver the same event and confirm no duplicate object is created.

## Incident response

For invalid signatures, disable the webhook, rotate `GITHUB_WEBHOOK_SECRET`, redeploy, and inspect rejected-delivery logs.

For leaked OAuth credentials, rotate the client secret, revoke affected tokens, and require reconnect.

For leaked private keys, generate a replacement key, deploy it, verify JWT/token issuance, then delete the compromised GitHub key.

For failed processing, inspect the sanitized delivery record, correct the platform fault, and use the authenticated retry route. Attempts are bounded.

For encryption-key loss, existing OAuth user tokens cannot be recovered. Rotate the key and reconnect GitHub.

## Rollback

Revert the control-plane commit or restore `start.sh` to launch `api/index.js`. No database migration is required. Preserve the auth, webhook, and platform state files for audit and recovery.
