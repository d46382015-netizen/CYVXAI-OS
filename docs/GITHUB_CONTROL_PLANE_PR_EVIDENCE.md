# GitHub Control Plane Verification Evidence

## Implemented vertical slice

- Raw-body HMAC-SHA256 webhook verification using `X-Hub-Signature-256` and constant-time comparison.
- Durable atomic JSON delivery store with replay protection, processing state, attempts, failures, and restart recovery.
- GitHub event mapping into existing CYVX `PlatformKernel` primitives.
- Public production gateway that keeps the existing API loopback-only and proxies existing HTTP/WebSocket traffic.
- External repairs for `/api/v1/workloads`, `/api/v1/actions`, and `/api/outcome` with explicit methods, bounded JSON parsing, validation, and API-key enforcement.
- Health endpoint: `GET /api/github/control-plane/health`.

## Local isolated validation

Executed against the new control-plane modules:

```text
node --check core/integrations/github_control_plane/signature.js
node --check core/integrations/github_control_plane/store.js
node --check core/integrations/github_control_plane/mapper.js
node --check core/integrations/github_control_plane/service.js
node --check api/production.js
node --test test/github-control-plane.test.js
```

Result before repository publication:

```text
tests: 5
passed: 5
failed: 0
```

The repository test now also includes a `PlatformKernel` restart-persistence case, which must be executed by repository CI with the complete checkout.

## Deployment gate

Do not change the GitHub App webhook URL until the deployed health endpoint reports:

```json
{
  "github_control_plane": {
    "configured": true
  }
}
```

Required production secret:

- `GITHUB_WEBHOOK_SECRET`

Required durable paths on Render persistent storage:

- `CYVX_PLATFORM_STATE`
- `CYVX_GITHUB_WEBHOOK_STORE`

## Rollback

Restore `start.sh` to launch `api/index.js`. The gateway adds no database migration and leaves the existing API implementation intact.
