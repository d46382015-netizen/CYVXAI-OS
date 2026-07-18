# CYVX Field Manual Production System

## Mission

Operate a faceless educational media and product-distribution system that converts complex modern topics into credible visual operating manuals.

The launch system ships:

- Complete brand tokens and usage rules
- Thirty approved publication packages across seven pillars
- Two hundred ten rendered carousel slides
- Finished captions, reel scripts, image prompts, and channel metadata
- A deterministic content build pipeline with optional AI enhancement
- A mobile-first landing page and PNG export studio
- Durable lead and event storage
- A printable Operator Starter Manual lead magnet
- Validation, logs, tests, CI automation, and build manifests

## Architecture

```text
brand.json + posts.js + lead-magnet.md
        |
        v
catalog validation
        |
        +--> deterministic SVG carousel renderer
        +--> caption / reel / AI prompt packages
        +--> printable lead magnet
        +--> SHA-256 manifest
        |
        v
Field Manual HTTP runtime
        |
        +--> public landing page
        +--> publication studio and browser PNG export
        +--> lead capture and consent storage
        +--> behavior event log
        +--> admin metrics and rebuild endpoints
```

## Storage

Default runtime state:

```text
~/.cyvx/field-manual/leads.json
~/.cyvx/field-manual/events.jsonl
~/.cyvx/field-manual/runtime.jsonl
```

Generated content:

```text
dist/field-manual/
  manifest.json
  catalog.json
  downloads/
  posts/<slug>/
```

Lead records are deduplicated by normalized email address. Runtime event types are allowlisted. IP addresses are stored only as SHA-256 hashes by the default adapter.

## Run

```bash
cd ~/CYVXAI-OS && \
bash ./scripts/field-manual.sh start
```

Open:

```text
http://127.0.0.1:3040
http://127.0.0.1:3040/studio
```

## Verify

```bash
cd ~/CYVXAI-OS && \
bash ./scripts/field-manual.sh verify
```

The suite proves:

- exactly 30 approved modules exist
- every module has required fields, slide types, CTA, caption, reel script, and disclaimer
- all slugs and IDs are unique
- the renderer creates 210 valid SVG slides
- the build creates a content-addressed manifest
- lead validation, consent, deduplication, and redaction work
- events reject unsupported types
- API health, catalog, lead capture, and downloads work

## Optional AI enhancement

The approved database is publication-ready without an external provider. To run an additional editorial adaptation through an OpenAI-compatible chat-completions endpoint:

```bash
cd ~/CYVXAI-OS && \
CYVX_CONTENT_AI_ENDPOINT='http://127.0.0.1:8080/v1/chat/completions' \
CYVX_CONTENT_AI_MODEL='local-model' \
node ./scripts/build-field-manual.js --ai
```

Use `CYVX_CONTENT_AI_TOKEN` only when the endpoint requires it. AI output remains bounded by the approved source and does not replace review for consequential claims.

## Public deployment requirements

Before exposing the service publicly:

1. Deploy behind HTTPS and authenticated edge controls.
2. Set `CYVX_FIELD_MANUAL_ADMIN_TOKEN` to protect metrics and build endpoints.
3. Use a production database or protected persistent volume for leads and events.
4. Add a verified email provider, working unsubscribe mechanism, sender identity, and legally required disclosures before campaigns.
5. Configure retention, backups, deletion requests, incident response, and access review.
6. Connect analytics and payment providers only through approved server-side adapters.
7. Review every cybersecurity, finance, real-estate, and Web3 module against current laws, provider behavior, and platform rules.
8. Run the build and verification suite before each release.

## API

```text
GET  /api/health
GET  /api/brand
GET  /api/posts?pillar=secure
GET  /api/posts/:slug
POST /api/leads
POST /api/events
GET  /api/metrics                    Bearer admin token
POST /api/pipeline/build             Bearer admin token
```

## Measurement contract

Primary content metric:

```text
saves_per_impression
```

Secondary metrics:

```text
shares_per_impression
profile_visit_rate
follow_conversion_rate
lead_conversion_rate
revenue_per_topic
```

A topic graduates into a paid implementation asset only after measurable demand or direct customer evidence. Views alone are not proof of commercial value.
