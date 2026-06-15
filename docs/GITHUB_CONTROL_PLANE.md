# CYVX GitHub Control Plane

The production gateway gives CYVX a verified GitHub event-ingestion path without exposing the internal API directly.

## Runtime

`npm start` launches `api/production.js`, which:

1. boots the existing CYVX controller and API on a loopback-only internal port;
2. exposes the public gateway on `CYVX_PORT`;
3. verifies GitHub webhook signatures before parsing payloads;
4. persists each delivery before mapping it into CYVX reality primitives;
5. rejects duplicate delivery IDs without creating duplicate records;
6. proxies all existing API and WebSocket traffic to the original runtime.

## Required Render variables

- `GITHUB_WEBHOOK_SECRET`: secret configured in the GitHub App webhook settings.
- `CYVX_GITHUB_WEBHOOK_STORE`: durable path for delivery state. On Render, use a mounted persistent-disk path.

Recommended:

- `CYVX_PORT=3000`
- `CYVX_INTERNAL_PORT=3001`
- `CYVX_GITHUB_WEBHOOK_MAX_BYTES=1000000`
- `CYVX_PLATFORM_STATE=/var/data/cyvx/platform-state.json`
- `CYVX_GITHUB_WEBHOOK_STORE=/var/data/cyvx/github-webhooks.json`

Do not store the webhook secret, client secret, private key, or tokens in the repository.

## GitHub App settings

- Homepage: `https://cyvxai-os.onrender.com`
- Webhook: `https://cyvxai-os.onrender.com/api/github/webhook`
- SSL verification: enabled

Do not switch the webhook URL until this branch is deployed and the health endpoint reports `configured: true`.

## Health

`GET /api/github/control-plane/health`

Reports configuration readiness, durable-store status, delivery counts, queue depth, failures, and last completion timestamps. It never returns secrets or webhook payloads.

## First-slice event mapping

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

## Rollback

Revert `start.sh` to `exec node ./api/index.js`. Existing APIs remain unchanged behind the gateway, so rollback does not require a data migration.
