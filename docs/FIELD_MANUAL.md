# CYVX Field Manual — Day 1 Production Runtime

## Mission

Convert Instagram and Facebook attention into permissioned owned leads, attributable product revenue, and evidence-backed operating telemetry.

```text
Instagram / Facebook content
  -> MANUAL | SECURE | DEPLOY comment trigger
  -> ManyChat External Request
  -> CYVX lead and asset API
  -> optional Kit v4 subscriber + interest tag sync
  -> downloadable operational asset
  -> Lemon Squeezy checkout + signed webhook
  -> LCE / SMV / OCR telemetry
```

## Delivered capability

- Three production content definitions with eight slides each.
- Exact 1080x1350 SVG generation using a 12-column by 12-row safe-zone grid.
- OPERATE violet, SECURE electric green, and BUILD cobalt blue category treatment.
- Real PDF generation for the Operator Assessment and Phone Theft Checklist.
- Real ZIP generation for the mobile website starter package.
- Mobile-first opt-in and monetization landing portal.
- ManyChat lead receiver with shared-secret authentication, email validation, keyword routing, deduplication, and interest metadata.
- Kit API v4 subscriber upsert and interest-tag synchronization.
- Lemon Squeezy raw-body HMAC verification, purchase ingestion, deduplication, and revenue telemetry.
- Durable append-only JSONL storage under `~/.cyvx/field-manual` by default.
- Rate limiting, honeypot suppression, request IDs, structured error logs, CSP, and download allowlisting.
- Automated tests covering content, rendering, downloads, persistence, provider routing, signatures, metrics, and the HTTP flow.

## One-command local activation

```bash
cd ~/CYVXAI-OS && \
cp config/field-manual.example.env .env.field-manual && \
set -a && . ./.env.field-manual && set +a && \
node scripts/render-field-manual.js && \
node scripts/start-field-manual.js
```

Open:

```text
http://127.0.0.1:3080
```

Generated assets:

```text
dist/field-manual/carousels/post_001/slide-01.svg ... slide-08.svg
dist/field-manual/carousels/post_002/slide-01.svg ... slide-08.svg
dist/field-manual/carousels/post_003/slide-01.svg ... slide-08.svg
dist/field-manual/downloads/CYVX_Operator_Readiness_Assessment.pdf
dist/field-manual/downloads/CYVX_Phone_Theft_Response_Checklist.pdf
dist/field-manual/downloads/Mobile_Website_Starter_Files.zip
```

## Verify

```bash
cd ~/CYVXAI-OS && \
node --check services/content-growth/index.js && \
node --check services/content-growth/server.js && \
node --check scripts/render-field-manual.js && \
node --check scripts/start-field-manual.js && \
node --test test/field-manual.test.js
```

The repository-wide `npm test` command also discovers `test/field-manual.test.js` through the existing test wildcard.

## Production environment

Copy `config/field-manual.example.env` and set:

```text
CYVX_FIELD_PUBLIC_BASE_URL=https://your-public-domain.example
CYVX_FIELD_ADMIN_TOKEN=<random-secret>
CYVX_MANYCHAT_WEBHOOK_SECRET=<random-secret>
KIT_API_KEY=<kit-v4-key>
KIT_TAG_GENERAL_OPERATOR=<numeric-tag-id>
KIT_TAG_SECURITY=<numeric-tag-id>
KIT_TAG_MOBILE_BUILD=<numeric-tag-id>
LEMONSQUEEZY_CHECKOUT_URL=<hosted-checkout-url>
LEMONSQUEEZY_WEBHOOK_SECRET=<signing-secret>
```

Do not commit live credentials.

## ManyChat configuration

Create one External Request action per trigger or reuse one action with a keyword field.

### Request

```text
POST https://your-domain.example/api/v1/webhooks/manychat
Content-Type: application/json
X-CYVX-Webhook-Secret: <CYVX_MANYCHAT_WEBHOOK_SECRET>
```

### JSON body

```json
{
  "subscriber_id": "{{user_id}}",
  "first_name": "{{first_name}}",
  "email": "{{system_email}}",
  "keyword": "MANUAL",
  "consent": true,
  "post_id": "POST_001"
}
```

Change `keyword` and `post_id` for the other routes:

| Keyword | Post | Intent | Asset |
|---|---|---|---|
| MANUAL | POST_001 | GENERAL_OPERATOR | CYVX_Operator_Readiness_Assessment.pdf |
| SECURE | POST_002 | SECURITY | CYVX_Phone_Theft_Response_Checklist.pdf |
| DEPLOY | POST_003 | MOBILE_BUILD | Mobile_Website_Starter_Files.zip |

The response provides `download_url`, `asset`, `reply`, `intent_tag`, and `source` for ManyChat response mapping.

## Lemon Squeezy configuration

Webhook URL:

```text
https://your-domain.example/api/v1/webhooks/lemonsqueezy
```

Subscribe initially to:

```text
order_created
order_refunded
subscription_created
subscription_payment_success
subscription_payment_failed
subscription_cancelled
subscription_expired
```

The runtime verifies the `X-Signature` HMAC against the unmodified request body before recording the event. Repeated webhook delivery is idempotent.

## Telemetry ingestion

Record Meta reach and interaction totals:

```bash
curl -fsS -X POST http://127.0.0.1:3080/api/v1/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $CYVX_FIELD_ADMIN_TOKEN" \
  -d '{"post_id":"POST_001","reach":1000,"keyword_comments":20,"dm_starts":15}'
```

Read operating metrics:

```bash
curl -fsS http://127.0.0.1:3080/api/v1/metrics \
  -H "X-Admin-Token: $CYVX_FIELD_ADMIN_TOKEN"
```

Formulas:

```text
LCE = captured leads / reach * 100
SMV = collected revenue USD / reach * 1000
OCR = unique paying customers / captured leads * 100
```

Initial targets:

```text
LCE >= 1.5%
SMV >= $10 per 1,000 reach
OCR >= 10%
```

## Public API

```text
GET  /health
GET  /api/v1/config
GET  /api/v1/posts
GET  /api/v1/posts/:postId/slides/:number.svg
POST /api/v1/leads
POST /api/v1/webhooks/manychat
POST /api/v1/webhooks/lemonsqueezy
POST /api/v1/telemetry
GET  /api/v1/metrics
GET  /downloads/:approvedAsset
```

## Day 1 completion contract

Day 1 is complete when:

- all 24 slides render successfully;
- all three download payloads open correctly;
- a landing-page opt-in creates exactly one durable lead;
- a repeated ManyChat payload is deduplicated;
- a consented test lead reaches Kit when credentials are configured;
- a signed Lemon Squeezy test event records revenue exactly once;
- LCE, SMV, and OCR are available through the metrics endpoint;
- the full field-manual test suite passes.
