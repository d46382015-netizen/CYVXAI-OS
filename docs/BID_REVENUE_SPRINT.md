# CYVX Bid & Revenue Sprint Operator

## Mission

Operate a real, evidence-backed revenue system for commercial cleaning, landscaping, facilities, security, and small construction businesses.

The first outcome contract is:

- collect **$5,000 in verified customer revenue**
- deliver and evidence the purchased outcome
- convert at least one accepted client into **$500/month Deal Desk Monitoring**

The target mix is three $1,500 Proposal Sprints plus one $500 Bid Readiness Pack. A $250 Opportunity Audit is the entry offer. Proposed deals, generated checkouts, and unsigned recurring offers never count as revenue.

## Architecture

```text
Minnesota official-source intelligence
  -> normalized opportunity registry
  -> qualification scorecard
  -> owner pursuit decision
  -> internal proposal production
  -> approval-gated submission / communication / checkout
  -> provider-verified or owner-attested payment
  -> fulfillment and acceptance evidence
  -> evidenced recurring agreement
  -> learning and repeatable growth loop
```

The operator reuses the universal entity runtime, durable mission state machine, revenue engine, Stripe webhook verification, permissioned CRM, evidence ledger, tenant isolation, recovery, and backup primitives. It does not create a parallel fake business state.

## Offers

| Offer | Price | Outcome |
|---|---:|---|
| Opportunity Audit | $250 | scored go/no-go, eligibility map, risks, and next action |
| Bid Readiness Pack | $500 | reusable compliance, capability, pricing, and submission-readiness system |
| Proposal Sprint | $1,500 | 14-day solicitation-specific response system and final QC |
| Deal Desk Monitoring | $500/month | recurring opportunity monitoring, scoring, deadline control, and pipeline review |

## Truth and governance

- Imported opportunities remain opportunities; they do not become prospects or leads automatically.
- A real inbound or authorized prospect record is required before a lead or deal exists.
- External messaging, proposal submission, contract acceptance, checkout sending, purchases, and money movement remain approval-gated.
- Stripe revenue is counted only after a signed, idempotent paid webhook.
- Manual revenue requires a business receipt reference and meaningful owner evidence.
- Recurring MRR requires a real client, completed initial fulfillment, a written agreement reference, monthly price, start date, and evidence.
- Every operating cycle records the current constraint, metrics, next best action, timestamp, and audit evidence.

## Storage

Default durable state:

```text
~/.cyvx/mission-runtime.db
~/.cyvx/bid-revenue-sprint/<organization>/<sprint>/
~/.cyvx/revenue/<organization>/<venture>/
~/.cyvx/intelligence/minnesota/state.json
~/.cyvx/logs/
~/.cyvx/backups/
```

SQLite remains organization-scoped and restart-safe. Generated sprint assets include the manifest, offer ladder, qualification scorecard, proposal SOP, recurring conversion playbook, and first-$5,000 revenue plan.

## Run

```bash
cd ~/CYVXAI-OS && \
npm ci --no-audit --no-fund && \
npm run bid:sprint:bootstrap && \
npm run bid:sprint
```

Open:

```text
http://127.0.0.1:3020/bid-revenue-sprint
```

The bootstrap command approves only bounded internal activation. It does not authorize external outreach, bid submission, contracts, purchases, or money movement.

Bootstrap is idempotent: rerunning it returns the existing organization-scoped sprint instead of creating duplicate ventures, missions, assets, or targets. The server resumes durable operating cycles from SQLite after restart.

## Verify

```bash
cd ~/CYVXAI-OS && \
npm run bid:sprint:verify
```

The verification suite proves:

- the $5,000 target mix and $500/month recurring target
- relevant intelligence import without fake leads
- governed activation and durable assets
- approval-gated bid submission tasks
- verified revenue truth
- fulfillment evidence before recurring conversion
- target completion only after both verified revenue and evidenced recurring MRR
- valid evidence and revenue ledgers

## API

```text
GET    /api/v4/bid-sprints
POST   /api/v4/bid-sprints
GET    /api/v4/bid-sprints/:id
POST   /api/v4/bid-sprints/:id/approve
POST   /api/v4/bid-sprints/:id/tick
POST   /api/v4/bid-sprints/:id/intelligence/import
POST   /api/v4/bid-sprints/:id/opportunities/:opportunityId/decision
POST   /api/v4/bid-sprints/:id/tasks/:taskId/decision
POST   /api/v4/bid-sprints/:id/recurring-agreements
```

All API routes except the dashboard require bearer authentication and preserve organization isolation.

## Production activation checklist

1. Configure a public HTTPS base URL.
2. Configure Stripe secret and webhook secrets.
3. Configure the business postal address and an approved email provider only when permissioned campaigns are needed.
4. Refresh official-source Minnesota intelligence.
5. Complete provider readiness checks.
6. Run the full production baseline.
7. Deploy behind authenticated edge controls.
8. Perform a backup and restore drill.
9. Use the dashboard approval inbox before every external side effect.
10. Count only evidence-backed outcomes.
