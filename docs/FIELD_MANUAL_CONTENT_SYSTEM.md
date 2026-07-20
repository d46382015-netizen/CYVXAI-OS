# CYVX Field Manual Content System

The CYVX Field Manual publication system is one connected production capability. It uses the existing public Field Manual runtime for lead capture, ManyChat routing, Kit synchronization, Lemon Squeezy revenue ingestion, durable telemetry, downloads, security controls, and public HTTPS mounting.

This content layer does not introduce a second server, database, provider adapter, renderer, or dashboard.

## Production inventory

```text
33 approved posts
234 deterministic 1080 × 1350 SVG slides
7 connected pillars
6 publication channels per expanded module
30 complete captions
30 complete reel scripts
30 image-production prompts
30 source SHA-256 digests
3 live keyword-triggered lead magnets
```

Pillars:

```text
SECURE
BUILD
SELL
OPERATE
OWN
CAPITAL
WEB3
```

The first three launch modules remain the conversion entry points:

```text
POST_001 → MANUAL → GENERAL_OPERATOR
POST_002 → SECURE → SECURITY
POST_003 → DEPLOY → MOBILE_BUILD
```

The additional modules are `POST_004` through `POST_033`. They are publication assets and do not silently create new messaging automations or lead magnets. A new keyword becomes operational only after its trigger, provider tag, approved asset, tests, and delivery path are implemented.

## Module contract

Each expanded module requires:

- unique pillar and slug;
- title, hook, measurable outcome, difficulty, time, cost, CTA, and disclaimer;
- exactly five executable steps;
- seven connected carousel slides;
- publication-ready caption;
- short-form reel script;
- image-production prompt;
- six channel assignments;
- primary and secondary performance metrics;
- deterministic source SHA-256 digest.

Catalog validation fails on missing fields, unsupported pillars, duplicate slugs, invalid IDs, incorrect slide totals, missing colors, or an inventory other than 30 expanded modules.

## Runtime routes

```text
GET /field-manual
GET /field-manual/health
GET /field-manual/api/v1/config
GET /field-manual/api/v1/posts
GET /field-manual/api/v1/posts/POST_004/slides/1.svg
POST /field-manual/api/v1/leads
POST /field-manual/api/v1/webhooks/manychat
POST /field-manual/api/v1/webhooks/lemonsqueezy
```

The standalone development runtime exposes the same routes without the `/field-manual` prefix.

## Run

```bash
cd ~/CYVXAI-OS && \
node scripts/start-field-manual.js
```

Open:

```text
http://127.0.0.1:3080
```

## Render

```bash
cd ~/CYVXAI-OS && \
node scripts/render-field-manual.js
```

Expected output:

```text
234 SVG carousel slides
2 PDF lead magnets
1 ZIP lead magnet
1 manifest
```

## Verify

```bash
cd ~/CYVXAI-OS && \
node scripts/verify-field-manual-content.js
```

The verifier performs:

- syntax checks;
- Field Manual unit, security, and public-gateway tests;
- exact catalog and slide-count verification;
- rendering of every file;
- existence and 1080 × 1350 dimension checks;
- asset SHA-256 calculation;
- aggregate content digest calculation;
- publication-source digest verification;
- machine-readable receipt generation.

Proof is written to:

```text
artifacts/field-manual-content/verification.json
artifacts/field-manual-content/manifest.json
```

## Truth boundary

The publication catalog proves complete content packages and deterministic assets. It does not prove that a social platform post was published, reached an audience, captured a live lead, or produced revenue.

Those states require separate evidence:

```text
rendered asset
→ published platform record
→ measured reach
→ consented lead
→ verified checkout/payment
→ accepted fulfillment
→ retained or expanded customer
```

The public Render deployment remains incomplete until the configured staging origin serves the expected current commit and the live MANUAL lead plus PDF-delivery receipt passes.
