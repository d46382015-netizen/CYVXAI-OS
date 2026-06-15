# Spark + CYVX Public Deployment

This release turns the repository into one public web service:

- `/` — public Spark product
- `/w/:slug` — generated operational Worlds
- `/os` — CYVX operator interface
- `/api/public/status` — sanitized public platform metrics
- `/healthz` and `/readyz` — deployment health and readiness
- `/api/github/*` — GitHub App control plane

The public edge starts three loopback-only services behind one internet-facing port:

1. the existing CYVX production gateway;
2. the existing CYVX API and WebSocket runtime;
3. the Spark execution runtime.

Spark's internal API is protected by a randomly generated service key. The public edge only forwards the bounded routes needed to create, approve, execute, configure, and collect leads. Administrative list and event routes are not public.

## Render deployment

The repository includes `render.yaml` with a Node web service, health check, persistent disk, locked build, and secret placeholders.

1. In Render, create a new Blueprint from `d46382015-netizen/CYVXAI-OS`.
2. Review the service name and region.
3. Supply the three GitHub App values marked `sync: false`:
   - `GITHUB_APP_SLUG`
   - `GITHUB_CLIENT_SECRET`
   - `GITHUB_PRIVATE_KEY_PEM`
4. Deploy while `CYVX_REQUIRE_GITHUB_APP=false`.
5. Verify `https://cyvxai-os.onrender.com/healthz` returns `ok: true`.
6. Verify the public Spark page, create a test Spark, approve it, execute it, and open its World.
7. Configure the GitHub App callback and webhook URLs.
8. Confirm the GitHub control-plane health endpoint is ready.
9. Set `CYVX_REQUIRE_GITHUB_APP=true` and redeploy.

## GitHub App URLs

- Homepage: `https://cyvxai-os.onrender.com`
- Callback: `https://cyvxai-os.onrender.com/api/github/oauth/callback`
- Webhook: `https://cyvxai-os.onrender.com/api/github/webhook`

Keep SSL verification enabled and Device Flow disabled.

## Persistence

The Render disk is mounted at `/var/data`. Runtime state is stored under `/var/data/cyvx`:

- `spark-state.json`
- `worlds/`
- `platform-state.json`
- `github-webhooks.json`
- `github-auth.json`
- `logs/spark-runtime.log`

Do not deploy production without persistent storage unless temporary demo data loss is acceptable.

## Deployment secrets

Render generates the following values when the Blueprint is created:

- `CYVX_API_KEY`
- `CYVX_OPERATOR_SESSION_SECRET`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_OAUTH_STATE_SECRET`
- `GITHUB_TOKEN_ENCRYPTION_KEY`

Never commit generated values, OAuth credentials, private keys, access tokens, owner keys, webhook payloads, or state files.

## GitHub Actions deployment hook

The workflow `.github/workflows/deploy-public.yml` verifies the entire public flow on every relevant pull request and push.

For explicit deployment after a successful push, add this repository secret:

- `RENDER_DEPLOY_HOOK_URL`

When that secret is absent, the workflow succeeds after verification and relies on Render auto-deploy or Blueprint deployment.

## Local verification

```bash
npm ci
npm run verify
npm run spark:verify
npm run public:test
PORT=3000 CYVX_REQUIRE_GITHUB_APP=false npm start
```

Then verify:

```bash
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/api/public/status
```

Open:

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/os`

## Release gate

Do not treat the deployment as complete until all of these are true:

- GitHub Actions verification is green.
- `/healthz` returns `ok: true`.
- a Spark can be created from the public page;
- its approval and execution complete;
- the generated World is publicly reachable;
- its lead form creates a durable lead;
- `/api/public/worlds` lists the operational World;
- the operator UI is reachable at `/os`;
- persistent state survives a redeploy;
- GitHub webhook ping, signature verification, and deduplication succeed.

## Rollback

Revert the public-unified-app commit and redeploy. The previous CYVX production gateway remains available in `api/production.js`, and the standalone Spark runtime remains available in `spark/server.js`.
