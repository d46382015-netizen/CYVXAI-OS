# The $1 Experiment — Production Campaign

## Locked policy
- Goal: 175,000,000 verified USD $1 contributions.
- One checkout is exactly USD $1.
- Net proceeds allocation: 50% personal compensation, 50% CYVXAI OS development.
- Net equals gross paid less refunds, open/lost disputes, and actual reconciled processor fees.
- Allocation is withheld until every paid checkout has a reconciled Stripe fee.
- Counter advances only after a valid Stripe webhook confirms a paid checkout.
- A payment return URL is not proof of payment.
- Public totals never expose donor names, emails, or payment identifiers.

## Transparency and launch gates
This is a voluntary personal/company funding experiment, not a charity or charitable solicitation. Contributions are not represented as tax-deductible. No investment, loan, equity, product, service, prize, or financial return is promised. Before accepting live payments, disclose the operator's legal identity, contact details, refund policy, privacy terms, business purpose, and destination of proceeds. Obtain legal/accounting review and confirm Stripe permits this business model.

## Runtime routes
- GET /experiment — public campaign page.
- GET /api/v1/experiment/public — privacy-safe verified metrics.
- POST /api/v1/experiment/checkout — fixed USD $1 Stripe Checkout Session.
- POST /api/v1/experiment/stripe/webhook — signed payment/refund/dispute events.
- POST /api/v1/experiment/admin/reconcile — administrator-only fee reconciliation.
- GET /api/v1/experiment/health — provider and storage readiness.

## Required environment
CYVX_ONE_DOLLAR_EXPERIMENT_ENABLED=false (keep false until launch gates pass).
CYVX_ONE_DOLLAR_EXPERIMENT_BASE_URL=https://your-campaign-domain
CYVX_BILLING_ENABLED=true
STRIPE_SECRET_KEY=...
CYVX_STRIPE_WEBHOOK_SECRET=...
CYVX_OPERATOR_CORS_ALLOWLIST must include campaign origin if cross-origin.

Register Stripe webhook events checkout.session.completed, charge.refunded, charge.dispute.created, charge.dispute.closed, and charge.succeeded. Stripe API access retrieves actual balance transaction fees.

## Launch gates
1. Complete legal review of personal/company fundraising, disclosures, tax treatment, and registration requirements.
2. Confirm Stripe approves the business model and connected account is verified.
3. Publish operator identity, mailing/contact address, privacy, refund, and complaint process.
4. Configure HTTPS domain, live Stripe keys, webhook secret, and webhook events.
5. Keep the enable flag false until every gate passes.
6. Run tests and reconcile a real low-value live transaction/refund before promotion.
7. Publish accounting reports and reconcile the 50/50 ledger regularly.

## Verification
npm run experiment:test
npm run experiment:verify
Do not count Stripe test-mode transactions as public participants or revenue.
