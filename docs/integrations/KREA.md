# CYVXAI × Krea

CYVXAI now treats Krea as a governed creative execution provider.

## Two connection paths

### Agent path: MCP

Use the hosted Streamable HTTP MCP server:

`https://api.krea.ai/mcp`

The canonical CYVX configuration is `config/mcp/krea.json`. Krea authenticates MCP clients through its supported connection flow. Do not put a Krea secret in this file.

### Backend path: Krea API

The CYVX integration hub uses Krea's REST API for server-side production workloads. Set:

```bash
export KREA_API_TOKEN='...'
```

Optional settings:

```bash
export KREA_API_BASE='https://api.krea.ai'
export KREA_TIMEOUT_MS='30000'
export KREA_AUDIT_FILE="$HOME/.cyvx/krea-events.jsonl"
export CYVX_REQUIRE_KREA='true'
```

Keep `KREA_API_TOKEN` server-side only.

## API surface

Authenticated routes are exposed through the integrated production gateway:

- `GET /api/v1/integrations/krea/status`
- `POST /api/v1/integrations/krea/generate`
- `GET /api/v1/integrations/krea/jobs/:job_id`
- `POST /api/v1/integrations/krea/jobs/:job_id/wait`

Generation requires `integrations:write` and therefore follows CYVX privileged-operation MFA policy.

Example request body:

```json
{
  "model": "image/krea/krea-2/medium",
  "input": {
    "prompt": "A cinematic CYVX command center at sunrise",
    "aspect_ratio": "16:9",
    "resolution": "1K"
  }
}
```

## Automation

The queue worker understands:

- `krea.generate`
- `krea.job.wait`

This lets missions submit creative jobs asynchronously instead of coupling mission execution to image/video completion.

## Audit and safety

Each Krea request writes a bounded JSONL audit record containing operation, tenant/user context, endpoint path, status, duration, and outcome. Credentials are never written to the audit stream. Audit files are rotated at 5 MB and created with owner-only permissions.

Model paths are validated to the Krea `image/*`, `video/*`, and `enhance/*` API namespaces and the API base URL must use HTTPS.

## Verification

Run:

```bash
node --test ./test/krea-provider.test.js
node --check ./core/integrations/krea_provider.js
node --check ./core/integrations/integration_hub.js
node --check ./api/integration_routes.js
```

Krea's current API documentation describes asynchronous jobs, bearer-token authentication, webhooks, and the model catalog; the hosted MCP endpoint is documented separately by Krea.
