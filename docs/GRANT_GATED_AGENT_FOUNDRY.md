# CYVX Grant-Gated Agent Foundry

The Agent Foundry has one execution boundary for its four consequential actions:

```text
Worker package
  -> Supervisor approval
  -> Boss authorization
  -> deterministic Constitution policy decision
  -> signed, expiring, single-use capability grant
  -> Agent Foundry gateway
  -> create/deploy/spend side effect
  -> durable resource record + governance receipt
```

## Governed actions

| Action | Runtime effect | Required exact grant |
|---|---|---|
| `create_agent` | Creates a persistent child-agent specification and active CYVX agent identity | `create_agent` |
| `deploy_staging` | Copies the approved artifact into an atomic staging release and activates `current.json` | `deploy_staging` |
| `deploy_production` | Copies the approved artifact into an atomic production release and activates `current.json` | `deploy_production` |
| `spend_budget` | Calls the configured synchronous spend provider and records its durable receipt | `spend_budget` |

There are no public Foundry methods that execute these actions without a grant. Sensitive grants cannot be manually consumed through the generic governance consume endpoint; they must be consumed by the matching Foundry action endpoint.

## Enforcement performed immediately before every action

1. Authenticated principal exists.
2. Grant is present, active, unexpired, and issued to that exact worker.
3. Grant capability exactly equals the requested action.
4. Grant signature matches the immutable package, mission, worker, cost ceiling, expiry, and Constitution hash.
5. Governance package remains `authorized` and names the same grant.
6. Global stop and external-action stop are inactive.
7. Spending is not frozen when cost is greater than zero.
8. Agent creation is not disabled for `create_agent`.
9. Actual cost does not exceed the grant.
10. A unique action run claims the grant to prevent concurrent or repeated execution.

After success, the Foundry consumes the grant, writes the actual cost to the governance budget ledger, stores the result hash and external reference, and marks the run `succeeded`.

## Failure behavior

- Validation failures cause no side effect and leave the grant active.
- Agent and local deployment failures are rolled back and recorded as `failed`.
- An external side effect that cannot be safely rolled back is marked `reconciliation_required`; the same grant cannot execute again until the incident is resolved.
- `spend_budget` moves no money unless a provider is configured.

## Artifact identity

Deployment packages must use the SHA-256 returned by `hashPath(source_path)`:

- A file is hashed from its bytes.
- A directory is hashed from a canonical, sorted manifest containing each relative path, type, size, and file SHA-256.
- Symbolic links and source paths outside the repository, evidence root, or artifact root are rejected.

The approved hash is checked again immediately before deployment, preventing post-approval modification.

## Spend provider

Provide a fixed executable and arguments as a JSON array. Shell execution is never used.

```bash
export CYVX_SPEND_COMMAND_JSON='["node","./integrations/spend-provider.js"]'
```

The command receives one JSON request on standard input and must return one JSON object on standard output:

```json
{
  "status": "succeeded",
  "external_reference": "provider_receipt_123",
  "metadata": {
    "provider": "connected-provider"
  }
}
```

Accepted statuses are `succeeded` and `authorized`. Credentials remain in the provider process environment and are never persisted by the Foundry.

## API

```text
GET  /api/v1/foundry/dashboard
GET  /api/v1/foundry/boundary/verify
POST /api/v1/foundry/actions/create_agent
POST /api/v1/foundry/actions/deploy_staging
POST /api/v1/foundry/actions/deploy_production
POST /api/v1/foundry/actions/spend_budget
```

Every POST body requires `grant_id` plus the action payload.

### Create agent

```json
{
  "grant_id": "grant_...",
  "name": "Landing Page Optimizer",
  "mission": "Improve qualified-lead conversion",
  "capabilities": ["analytics", "copywriting"],
  "permissions": {
    "repository_write": true,
    "deploy_requires_grant": true
  },
  "budget": {
    "monthly_usd": 5
  }
}
```

### Deploy

```json
{
  "grant_id": "grant_...",
  "source_path": "artifacts/release",
  "app_id": "cyvx-app",
  "actual_cost_usd": 0
}
```

### Spend

```json
{
  "grant_id": "grant_...",
  "amount_usd": 5,
  "currency": "USD",
  "vendor": "Compute Provider",
  "purpose": "Approved infrastructure",
  "idempotency_key": "invoice-2026-0001"
}
```

## Storage

Migration `004_grant_gated_agent_foundry.sql` adds:

- `foundry_action_runs`
- `foundry_agents`
- `foundry_deployments`
- `foundry_spend_receipts`

All records are organization-scoped and bind to a mission, package, worker, and capability grant.

## Run and verify

```bash
cd ~/CYVXAI-OS && npm run verify:foundry && npm run governance
```

Open `http://127.0.0.1:8790/governance` to inspect and execute the complete workflow.
