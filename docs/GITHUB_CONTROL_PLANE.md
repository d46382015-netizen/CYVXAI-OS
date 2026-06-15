# CYVX GitHub Control Plane

The production gateway gives CYVX a verified GitHub event-ingestion and installation-authentication path without exposing the internal API directly.

## Runtime

`npm start` launches `api/production.js`, which:

1. boots the existing CYVX controller and API on a loopback-only internal port;
2. exposes the public gateway on `CYVX_PORT`;
3. verifies GitHub webhook signatures before parsing payloads;
4. persists each delivery before mapping it into CYVX reality primitives;
5. rejects duplicate delivery IDs without creating duplicate records;
6. creates GitHub App JWTs and short-lived installation tokens;
7. protects OAuth state with an expiring, one-time HMAC token;
8. encrypts persisted GitHub user tokens with AES-256-GCM;
9. proxies all existing API and WebSocket traffic to the original runtime.

## Required Render variables

Webhook and storage:

- `GITHUB_WEBHOOK_SECRET`
- `CYVX_GITHUB_WEBHOOK_STORE=/var/data/cyvx/github-webhooks.json`
- `CYVX_PLATFORM_STATE=/var/data/cyvx/platform-state.json`
- `CYVX_GITHUB_AUTH_STORE=/var/data/cyvx/github-auth.json`

GitHub App authentication:

- `GITHUB_APP_ID=3853563`
- `GITHUB_APP_SLUG` — the URL slug shown in the GitHub App public URL
- `GITHUB_CLIENT_ID=Iv23lieBU1HBubq5cv03`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_PRIVATE_KEY_PEM` — the complete PEM, supplied as a secret; escaped `\n` values are normalized
- `GITHUB_OAUTH_STATE_SECRET` — at least 32 random characters
- `GITHUB_TOKEN_ENCRYPTION_KEY` — at least 32 random characters or a 32-byte hex/base64url key
- `CYVX_OWNER_ID` — stable owner/user identifier until multi-user CYVX authentication is connected
- `APP_BASE_URL=https://cyvxai-os.onrender.com`

Recommended runtime variables:

- `CYVX_PORT=3000` or allow Render's `PORT`
- `CYVX_INTERNAL_PORT=3001`
- `CYVX_GITHUB_WEBHOOK_MAX_BYTES=1000000`

Do not store the webhook secret, client secret, private key, OAuth state secret, encryption key, or tokens in the repository.

## GitHub App settings

- Homepage: `https://cyvxai-os.onrender.com`
- Callback URL: `https://cyvxai-os.onrender.com/api/github/oauth/callback`
- Webhook URL: `https://cyvxai-os.onrender.com/api/github/webhook`
- Request user authorization during installation: enabled
- Setup URL: blank while OAuth authorization during installation is enabled
- Device Flow: disabled until explicitly implemented and tested
- SSL verification: enabled

Do not switch the webhook URL until this branch is deployed and the health endpoint reports `webhook.configured: true`.

## Endpoints

- `POST /api/github/webhook` — signed delivery ingestion
- `GET /api/github/install` — starts GitHub App installation for the authenticated CYVX user
- `GET /api/github/oauth/callback` — validates state, exchanges the code, encrypts the token, and records installations
- `GET /api/github/installations` — returns sanitized connection state for the authenticated CYVX user
- `DELETE /api/github/installations/:id` — disconnects the user's CYVX-side GitHub installation
- `GET /api/github/control-plane/health` — reports readiness without exposing credentials

Until CYVX user authentication is wired, `GET /api/github/install` and installation-management endpoints use `X-CYVX-User-ID` or the server-side `CYVX_OWNER_ID` fallback. Do not accept arbitrary public user identifiers at the edge; place these routes behind the authenticated CYVX session layer before multi-user launch.

## Installation-token behavior

GitHub App JWTs use RS256, a short expiration, and a backdated issued-at claim to tolerate clock skew. Installation tokens are isolated by installation, requested permissions, and repository selection. Tokens are cached only in memory and refreshed before the expiration safety window. Tokens are never written to logs or normal state files.

## Health

`GET /api/github/control-plane/health`

Reports:

- webhook configuration and durable delivery state;
- GitHub App ID/private-key readiness;
- installation-token cache health;
- OAuth/client/encryption readiness;
- active one-time states and sanitized connection totals.

It never returns secrets, private-key material, tokens, encrypted token envelopes, or webhook payloads.

## Event mapping

- `push` → Observation
- `issues` → Constraint
- merged `pull_request` → Outcome
- failed `workflow_run` or `check_run` → Constraint
- successful `workflow_run` → Observation

Every mapped object contains the GitHub delivery ID, event, action, installation, repository, actor, source URL, object ID, commit SHA, timestamp, and confidence in metadata.

## Verify

```bash
npm test
npm run build
node --check api/production.js
curl -sS https://cyvxai-os.onrender.com/api/github/control-plane/health
```

Use GitHub App settings → Advanced → Recent deliveries → Redeliver to verify signature validation, idempotency, persistence, and mapping.

## Credential rotation

1. Generate the new secret/private key in GitHub.
2. Add the replacement value to Render without removing the old GitHub credential first.
3. deploy and verify health;
4. verify installation-token issuance or OAuth connection;
5. remove the retired credential from GitHub and Render;
6. review logs for authorization failures.

Rotating `GITHUB_TOKEN_ENCRYPTION_KEY` requires decrypting and re-encrypting saved credentials or reconnecting GitHub. Do not replace it blindly while encrypted connections exist.

## Rollback

Revert `start.sh` to `exec node ./api/index.js`. Existing APIs remain unchanged behind the gateway, and no database migration is required. Preserve `github-webhooks.json` and `github-auth.json` for investigation or later reactivation.
