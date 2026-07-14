# CYVX Venture Revenue Engine v3

CYVX Venture Revenue Engine turns an activated universal Venture entity into a governed customer-acquisition, payment, fulfillment, and retention capability.

It does not manufacture prospects, clients, or revenue for presentation. Every number shown by the revenue dashboard is derived from a persisted real-world event:

```text
Real person or organization
→ verified contact source or direct opt-in
→ CRM prospect
→ inbound demand or qualification
→ deal
→ payment request
→ provider-verified payment or evidenced owner receipt
→ client
→ fulfillment
→ acceptance evidence
→ retention and expansion
```

## Truth rules

The engine enforces the following distinctions:

| Record | What it proves |
|---|---|
| Prospect | A real contact was imported, discovered from an authorized source, entered by the owner, or self-submitted |
| Lead | A prospect expressed demand or was advanced into the active pipeline |
| Deal | A commercial opportunity with a stage, value, probability, and next action exists |
| Checkout | A payment request exists; it is not revenue |
| Client | A deal was won and a customer record exists |
| Revenue | A payment is `paid` and verified by Stripe or supported by an owner-attested receipt evidence artifact |
| Fulfillment | Deliverables, acceptance criteria, due state, and completion evidence exist |

No lead, client, or revenue counter is incremented merely because CYVX generated an asset.

## Connected architecture

```text
Universal Venture Entity
├── RealityOS entity and relationships
├── Outcome contract targeting revenue_cents
├── Mission lifecycle and approvals
├── Owner-controlled revenue workspace
├── Commercial asset factory
├── Prospect registry and source evidence
├── Permissioned campaign engine
├── CRM pipeline
├── Stripe Checkout and signed webhooks
├── Manual payment evidence path
├── Client and fulfillment system
├── Mission evidence chain
├── Revenue event hash chain
└── Universal and legacy operator metric synchronization
```

The existing Bid & Revenue Sprint is migrated automatically into `revenue_ventures`; its original company, mission, workspace, public page, evidence, leads, and revenue remain intact.

## Production storage

The same SQLite WAL mission database contains:

- `revenue_ventures`
- `revenue_assets`
- `revenue_prospects`
- `revenue_campaigns`
- `revenue_messages`
- `revenue_deals`
- `revenue_clients`
- `revenue_payments`
- `revenue_fulfillments`
- `revenue_events`

Default owned revenue workspace:

```text
~/.cyvx/revenue/<organization>/<venture>/
├── venture.json
├── assets/
│   ├── offer.md
│   ├── proposal-template.md
│   ├── discovery-script.md
│   ├── lead-magnet.md
│   ├── outreach-sequence.json
│   └── fulfillment-sop.md
└── public/
    ├── revenue.html
    ├── privacy.html
    ├── terms.html
    └── thank-you.html
```

Every material asset is hashed and added to the mission evidence chain.

## Real acquisition boundary

CYVX can ingest prospects through:

- direct opt-in forms;
- existing customer or partner relationships;
- authorized imports;
- real public business records or directories with source metadata.

Automatic campaign email is limited to contacts whose basis is:

- `opt_in`; or
- `existing_relationship`.

`public_business_contact` records may be researched, scored, queued, and reviewed, but are not automatically emailed by the campaign runner. This prevents a real-data system from becoming an unbounded spam system.

Campaign sending also requires:

- administrator approval;
- a real Resend or Postmark configuration;
- a public HTTPS base URL;
- a business postal address;
- daily send limits;
- a working unsubscribe URL;
- one-send-per-campaign/prospect idempotency.

## Real payment boundary

### Stripe provider verification

A Stripe Checkout Session is only a payment request. Revenue is recorded after a signed Stripe event proves the checkout was paid.

Supported revenue events include:

- `checkout.session.completed` with `payment_status=paid`;
- `checkout.session.async_payment_succeeded`.

The webhook path is idempotent on Stripe event ID. A successful event:

1. marks the payment paid;
2. marks the deal won;
3. creates the client;
4. updates client lifetime value;
5. creates fulfillment work;
6. records a tamper-evident payment artifact;
7. synchronizes real revenue into the universal and legacy operators.

### Owner-attested receipts

Cash, bank transfer, PayPal, invoice, check, or another provider can be recorded by an administrator only when they supply:

- a receipt or invoice reference;
- amount and currency;
- a detailed evidence note;
- the linked deal.

This revenue is explicitly labeled `owner_attested`, separate from `provider_verified` revenue.

## Provider configuration

### Public URL

`127.0.0.1` cannot receive customers or Stripe webhooks. Production needs a deployed HTTPS origin:

```bash
export CYVX_PUBLIC_BASE_URL="https://your-public-domain.example"
```

### Email

Resend:

```bash
export CYVX_EMAIL_ENABLED=true
export CYVX_EMAIL_PROVIDER=resend
export RESEND_API_KEY="..."
export CYVX_EMAIL_FROM="CYVX <hello@your-domain.example>"
export CYVX_EMAIL_REPLY_TO="dakota@your-domain.example"
export CYVX_BUSINESS_POSTAL_ADDRESS="Your valid business mailing address"
```

Postmark:

```bash
export CYVX_EMAIL_ENABLED=true
export CYVX_EMAIL_PROVIDER=postmark
export POSTMARK_SERVER_TOKEN="..."
export CYVX_EMAIL_FROM="CYVX <hello@your-domain.example>"
export CYVX_BUSINESS_POSTAL_ADDRESS="Your valid business mailing address"
```

Domain authentication must be completed with the chosen provider before production sending.

### Stripe

```bash
export CYVX_BILLING_ENABLED=true
export STRIPE_SECRET_KEY="..."
export CYVX_STRIPE_WEBHOOK_SECRET="..."
```

Stripe webhook destination:

```text
https://your-public-domain.example/api/v3/revenue/stripe/webhook
```

No secret values belong in Git or public files.

## Run

Local/UserLAnd verification:

```bash
cd ~/CYVXAI-OS && \
npm ci --no-audit --no-fund && \
npm run revenue:verify && \
CYVX_ALLOW_INSECURE_LOCAL=true npm run revenue
```

Open:

```text
http://127.0.0.1:3020/revenue
```

Universal entity approval and activation remain at:

```text
http://127.0.0.1:3020/operator
```

## Operating sequence

1. Create the venture in `/revenue`.
2. Open `/operator`, approve its universal outcome contract, and run it to idle.
3. Return to `/revenue` and choose **Build and launch revenue system**.
4. Review the generated offer, proposal, discovery, lead-magnet, sales-page, fulfillment, privacy, and terms assets.
5. Deploy the runtime to a public HTTPS origin.
6. Connect Stripe and a verified email provider.
7. Capture opt-in leads or import real authorized prospects.
8. Qualify and advance deals.
9. Create checkout or record an evidenced receipt.
10. Deliver the client outcome and record acceptance evidence.
11. Ask for proof, referrals, renewal, or expansion.

## API

Public:

- `GET /v/:slug`
- `GET /v/:slug/privacy`
- `GET /v/:slug/terms`
- `GET /v/:slug/thank-you`
- `POST /api/v3/revenue/ventures/:slug/leads`
- `POST /api/v3/revenue/ventures/:slug/checkout`
- `GET|POST /api/v3/revenue/unsubscribe/:token`
- `POST /api/v3/revenue/stripe/webhook`
- `GET /api/v3/revenue/health`

Authenticated:

- `GET|POST /api/v3/revenue/ventures`
- `GET /api/v3/revenue/ventures/:id`
- `POST /api/v3/revenue/ventures/:id/activate`
- `POST /api/v3/revenue/ventures/:id/prospects/import`
- `POST /api/v3/revenue/ventures/:id/campaigns`
- `POST /api/v3/revenue/campaigns/:id/approve`
- `POST /api/v3/revenue/campaigns/:id/run`
- `POST /api/v3/revenue/ventures/:id/deals`
- `POST /api/v3/revenue/deals/:id/stage`
- `POST /api/v3/revenue/deals/:id/checkout`
- `POST /api/v3/revenue/ventures/:id/payments/manual`
- `POST /api/v3/revenue/fulfillments/:id/complete`
- `GET /api/v3/revenue/ventures/:id/ledger/verify`

## Verification

```bash
npm run revenue:verify
```

The suite proves:

- universal venture creation and approval;
- owner-controlled asset production;
- mission evidence hashing;
- real inbound prospect and deal creation;
- no client or revenue before payment;
- campaign approval, consent, unsubscribe, and provider boundaries;
- Stripe checkout creation;
- signed provider payment processing and webhook idempotency;
- client and fulfillment creation;
- owner-attested receipt evidence;
- fulfillment completion evidence;
- universal and legacy revenue synchronization;
- revenue-ledger integrity;
- public and authenticated HTTP behavior;
- fail-closed operation when Stripe or email is missing.

## Explicit nonclaims

Code can create and operate the infrastructure needed to acquire and serve customers. It cannot guarantee that a real person will buy. Genuine revenue still depends on a real market, a compelling offer, public distribution, trusted proof, and completed provider onboarding.

The engine therefore measures the complete funnel and reports the next constraint instead of presenting generated files as commercial success.