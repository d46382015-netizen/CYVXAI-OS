# CYVX Supabase Agent Runtime

This runtime connects CYVX missions, agent identities, artifacts, evidence, governance approvals, capability grants, deployments, spend receipts, and outcomes to the production Supabase schema.

## Security boundary

Three credentials have different purposes and must never be interchanged:

| Credential | Purpose | Exposure |
|---|---|---|
| Publishable key | Browser and RLS-scoped clients | Public by design |
| Supabase secret key | Auth administration and service-only database writes | Server-only encrypted secret |
| Supabase personal access token | Schema deployment through the CLI/Management API | Deployment-only encrypted secret |

A Supabase secret key is not the database password. A personal access token is not an application service key.

Because credentials were supplied through an interactive chat, rotate the secret key and personal access token after the first successful production deployment, then update the encrypted environment secrets.

## Required production environment secrets

Schema deployment workflow:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD
```

Production canary workflow:

```text
SUPABASE_SECRET_KEY
CYVX_OWNER_EMAIL
CYVX_OWNER_PASSWORD
```

The repository contains no secret values. `.cyvx/` and `.env*` remain ignored.

## Owner bootstrap

```bash
cd ~/CYVXAI-OS && \
export SUPABASE_SECRET_KEY='server-secret-from-secure-store' && \
export CYVX_OWNER_EMAIL='owner@example.com' && \
npm run supabase:bootstrap
```

The bootstrap command:

1. Verifies `cyvx_schema_status()` and refuses cloud writes unless the schema is ready.
2. Creates or updates the owner Auth identity.
3. Signs in through the publishable client.
4. Calls `cyvx_create_organization(name, slug)` as the authenticated owner.
5. Repairs the owner membership and governance controls idempotently on reruns.
6. Stores generated owner credentials in `.cyvx/secrets/supabase-bootstrap.json` with mode `0600` when no password is supplied.
7. Never prints access or refresh tokens.

## Agent identity issuer

`core/integrations/supabase-agent-identity.js` creates a dedicated Supabase Auth identity for each registered CYVX agent.

Each issued access token contains server-controlled `app_metadata`:

```json
{
  "organization_id": "<organization UUID>",
  "agent_id": "<registered agent ID>",
  "agent_token_version": 1
}
```

The email is deterministically derived from the organization and agent IDs. Passwords are randomly generated for each issuance and are never persisted or returned. The issuer signs in immediately and returns the session token to the calling server process.

Revocation increments `agents.token_version`. RLS rejects every older access token immediately because the JWT version no longer matches the database record.

## Persistence adapter

`core/integrations/supabase-persistence-adapter.js` exposes explicit methods rather than arbitrary table writes.

RLS-scoped methods:

- `registerParentAgent`
- `createMission`
- `assignAgent`
- `appendMissionEvent`
- `uploadArtifact`
- `appendEvidence`
- `recordOutcome`

Service-only methods:

- `submitGovernancePackage`
- `recordGovernanceReview`
- `issueCapabilityGrant`
- `recordFoundryAction`
- `recordDeployment`
- `recordSpendReceipt`

Service-only writes still pass database invariants. Child creation, deployment, and spending records are rejected unless the organization, mission, worker, capability, grant ID, status, expiration, and cost ceiling match.

Artifact bytes use this immutable path:

```text
<organization_id>/<mission_id>/<artifact_id>/<file_name>
```

The storage bucket has no authenticated update or delete policy.

## Production canary

Run locally with protected environment values:

```bash
cd ~/CYVXAI-OS && \
export SUPABASE_SECRET_KEY='server-secret-from-secure-store' && \
export CYVX_OWNER_EMAIL='owner@example.com' && \
export CYVX_OWNER_PASSWORD='strong-owner-password' && \
npm run supabase:canary
```

Or dispatch **Supabase Production Canary** with confirmation `CANARY` after adding the required encrypted secrets to the protected `production` environment.

The canary performs:

```text
Schema readiness
→ owner and organization bootstrap
→ independent Supervisor and Boss identities
→ parent agent registration
→ agent access-token issuance
→ mission creation and assignment
→ agent event
→ immutable artifact upload
→ evidence and outcome persistence
→ governance package
→ Supervisor approval
→ Boss authorization
→ deploy_staging capability grant
→ grant-bound Foundry action
→ staging deployment receipt
→ second-organization isolation read test
→ second-organization isolation write test
→ audit proof verification
```

Canary records are intentionally retained as production evidence.

## Verify

```bash
npm run verify:supabase:agents
npm run test:supabase
npm run verify:governance
```

## Fail-closed guarantees

- No secret key: privileged operations stop.
- Invalid secret key type: privileged operations stop.
- Schema not ready: every persistence method stops.
- Missing agent assignment: agent writes fail under RLS.
- Stale agent token version: agent writes fail under RLS.
- Foreign organization token: reads return no rows and writes fail.
- Missing or mismatched capability grant: Foundry deployment/spend records fail in PostgreSQL.
- Missing Supervisor or Boss evidence: the canary cannot construct an approved deployment proof.
