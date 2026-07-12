# CYVX Production Activation and First Governed Venture

This release turns the existing governance, Foundry, Supabase, and evidence components into one production activation path and one measurable business mission.

## What activation does

```text
Static security and contract verification
→ optional Supabase project link and migration push
→ live schema readiness check
→ owner and CYVX organization bootstrap
→ governed infrastructure canary
→ first business mission creation
→ five-agent venture pod creation through create_agent grants
→ specialist identity issuance and mission assignment
→ staging offer asset generation and immutable storage
→ Supervisor approval
→ Boss authorization
→ deploy_staging grant
→ grant-bound staging release record
→ production-gate evaluation
→ redacted activation evidence
```

Activation is resumable. Organization, parent agent, mission, pod agents, assignments, staging asset, evidence, deployment, and outcomes use stable identities where appropriate. Existing records are reused instead of creating an uncontrolled duplicate swarm.

## Protected production workflow

Dispatch **CYVX Production Activation** with confirmation:

```text
ACTIVATE
```

The workflow requires these encrypted values in the GitHub `production` environment:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD
SUPABASE_SECRET_KEY
CYVX_OWNER_EMAIL
CYVX_OWNER_PASSWORD
```

It installs locked dependencies and runs:

```bash
npm run production:activate
```

`CYVX_ACTIVATION_APPLY_SCHEMA=true` causes the controller to link project `yokpfcbdvszdavohibkh`, show the migration plan, apply all migrations, verify schema version `202607120004`, run the canary, and stage the first venture.

## Local activation

Use environment variables or hidden shell prompts. Never put passwords, access tokens, secret keys, or database URLs in repository files or command history.

```bash
cd ~/CYVXAI-OS
export SUPABASE_ACCESS_TOKEN='from-secure-store'
export SUPABASE_DB_PASSWORD='from-secure-store'
export SUPABASE_SECRET_KEY='from-secure-store'
export CYVX_OWNER_EMAIL='owner@example.com'
export CYVX_OWNER_PASSWORD='from-secure-store'
export CYVX_ACTIVATION_APPLY_SCHEMA=true
npm run production:activate
```

A redacted report is written with mode `0600` to:

```text
.cyvx/evidence/production-activation-latest.json
```

## First venture

The first mission is **CYVX Production Systems Audit**.

It targets small service businesses whose lead intake, scheduling, follow-up, delivery, or reporting work is disconnected or manual. The staging offer includes:

- Current-state workflow map
- Constraint and failure-point analysis
- Prioritized automation opportunity scorecard
- One reversible staging prototype
- Implementation, measurement, security, and rollback plan

The price anchor is `$1,500`, not recorded revenue. The system does not claim savings, compliance, security, buyer demand, customers, or revenue without external evidence.

## Governed venture pod

The parent Foundry agent creates five specialists:

```text
Opportunity Validator
Venture Architect
Asset Builder
QA and Security
Venture Operator
```

Every child agent requires its own complete authorization chain:

```text
Agent specification hash
→ governance package
→ Supervisor APPROVED
→ Boss AUTHORIZE
→ create_agent grant
→ database grant-binding trigger
→ child identity
→ mission assignment
→ Foundry action receipt
→ consumed grant
```

Pod constraints:

- No production deployment authority
- No spending authority
- Zero-dollar initial budget
- Organization-bound identity
- Mission-scoped assignment
- Immediate token-version revocation
- Defined termination condition

## Staging deployment

The Asset Builder produces an immutable HTML offer asset in the private `cyvx-artifacts` bucket. Deployment is recorded only after:

```text
Artifact hash
→ evidence record
→ Supervisor review
→ Boss authorization
→ deploy_staging grant
→ Foundry action
→ staging release receipt
```

The staging manifest explicitly records:

```json
{
  "reversible": true,
  "external_publication": false,
  "measurement_required_before_production": true
}
```

This is a real persisted staging release, not a claim that a public domain or acquisition channel is already active.

## Production gate

Internal completion cannot authorize production. All thresholds must pass:

```text
At least 3 buyer interviews
At least 1 qualified lead
At least 1 explicit paid-intent signal
Healthy staging release
0 critical security findings
```

Until then, the decision remains:

```text
remain_in_staging_validation
```

Passing the gate does not deploy production automatically. It creates eligibility for a separate Supervisor/Boss-governed `deploy_production` package.

## Verification

```bash
npm run verify:activation
npm run test:activation
npm run verify:governance
```

The verification gate checks:

- No committed Supabase secrets, access tokens, or exposed passwords
- JavaScript syntax
- Five bounded specialist agents
- `create_agent` grant path
- `deploy_staging` grant path
- Independent Supervisor and Boss records
- Protected GitHub production environment
- Schema application in activation workflow
- Redacted evidence artifact
- Demand-based production gate

## Current hard boundary

The repository and workflows can be completed through GitHub, but encrypted GitHub environment secrets cannot be created through the current repository connector. The activation controller therefore remains fail-closed until those encrypted values are installed through GitHub Actions settings or an authenticated `gh secret set --env production` command.

Credentials pasted into chat must be rotated after activation. Rotation includes:

- Supabase database password
- Supabase personal access token
- Supabase server secret key

Update the corresponding encrypted production secrets after rotation.
