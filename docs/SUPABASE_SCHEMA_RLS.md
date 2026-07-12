# CYVXAI-OS Production Supabase Schema and RLS

## Status contract

CYVX cloud writes are fail-closed until the remote database returns:

```json
{
  "schema": "cyvx-production",
  "expected_version": 202607120004,
  "applied_version": 202607120004,
  "ready": true
}
```

The runtime checks this through:

```text
POST /rest/v1/rpc/cyvx_schema_status
```

Local endpoint:

```text
GET /api/v1/runtime/supabase/schema-status
```

A reachable Supabase project is not considered safe for data writes unless the schema readiness contract passes.

## Production data model

The migrations create organization-scoped tables for:

- Organizations and memberships
- Agent registry and lineage
- Missions and assignments
- Mission events
- Immutable artifacts and evidence
- Governance principals and constitutions
- Emergency controls
- Worker packages, signed reviews, and capability grants
- Budget ledger and tamper-evident governance events
- Foundry action runs
- Staging and production deployments
- Governed spend receipts
- Measured outcomes

The complete contract is maintained in `supabase/schema-contract.json`.

## Tenant isolation

Every business table contains `organization_id` and has both RLS and forced RLS enabled.

Human access is derived from `organization_members`:

```text
owner       Full organization authority
admin       Membership and operational administration
supervisor  Technical/compliance review visibility
boss        Executive governance visibility and controls
operator    Mission and agent operations
viewer      Read-only organization visibility
```

Organizations are created only through `cyvx_create_organization(name, slug)`, which creates the organization, owner membership, and emergency-control row atomically.

The final active owner cannot be removed, disabled, or demoted.

## Agent identity and scope

Agent JWTs must carry server-controlled `app_metadata`:

```json
{
  "organization_id": "<organization uuid>",
  "agent_id": "agent_...",
  "agent_token_version": 1
}
```

The database validates that:

- The organization claim is a valid UUID.
- The agent exists in that organization.
- The agent is active.
- The token version matches the current registry version.
- The agent has an active assignment to the requested mission.

Agents receive direct INSERT access only to:

```text
mission_events
artifacts
evidence_records
outcomes
```

They may read only their assigned missions and related records. Agents cannot directly write governance packages, approvals, grants, budget entries, Foundry runs, deployments, or spend receipts.

## Grant-bound side effects

Database triggers independently validate grant binding for:

```text
create_agent
 deploy_staging
 deploy_production
 spend_budget
```

A child agent requires a matching `create_agent` grant issued to its parent.

A Foundry run, deployment, or spend receipt must match the same:

- Organization
- Mission
- Worker/grantee
- Grant ID
- Capability
- Cost ceiling

These checks still execute when a privileged server connection bypasses RLS.

## Same-organization integrity

Composite foreign keys prevent cross-tenant references between missions, agents, assignments, artifacts, evidence, packages, grants, deployments, spending, and outcomes.

`organization_id` is immutable after insertion on mutable organization-scoped records.

## Append-only records

The database rejects UPDATE and DELETE operations for:

- Mission events
- Artifacts
- Evidence records
- Governance reviews
- Budget ledger entries
- Governance events
- Spend receipts
- Outcomes

Corrections are represented by new records rather than destructive edits.

## Artifact storage

The private bucket is:

```text
cyvx-artifacts
```

Required object path:

```text
<organization_uuid>/<mission_id>/<artifact path>
```

Authenticated users can read objects only through organization membership. Agents can read and insert objects only for assigned missions. There is no authenticated UPDATE or DELETE storage policy.

## Verification

Static contract verification:

```bash
npm run verify:supabase:schema
```

Full local Supabase rebuild:

```bash
supabase start && \
supabase db reset && \
npm run verify:supabase:schema && \
supabase stop --no-backup
```

Remote readiness verification:

```bash
npm run verify:supabase:schema:live
```

Complete governed runtime verification:

```bash
npm run verify:governance
```

## Production deployment

The `Deploy Supabase Schema` GitHub workflow requires the protected `production` environment and these encrypted secrets:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD
```

It links project `yokpfcbdvszdavohibkh`, shows the migration plan, applies all pending migrations, then calls the live schema readiness RPC.

The publishable browser key cannot apply migrations and must never be replaced with a service-role key in public configuration.

## Required order before cloud persistence

```text
1. Merge validated migrations
2. Configure protected deployment secrets
3. Run Deploy Supabase Schema with confirmation DEPLOY
4. Confirm cyvx_schema_status.ready = true
5. Provision agent JWTs with app_metadata claims
6. Route cloud writes through runtime.assertCloudWritesReady()
7. Enable agent cloud persistence
```

Until step 4 succeeds, `cloud_writes_ready` remains false and write-capable runtime paths must reject the operation.
