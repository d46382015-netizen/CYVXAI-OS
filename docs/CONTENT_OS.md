# CYVX Content OS — Production Slice v1

CYVX Content OS is the first complete **topic → plan → render → measure → learn** capability inside CYVXAI-OS. It is intentionally bounded: one dependable vertical workflow with durable state, a mobile control room, an authenticated HTTP API, an independently leased render worker, real FFmpeg output, measurement ingestion, audit events, tests, and operational scripts.

## Runtime architecture

```text
Mobile control room
      │
      ▼
HTTP API + validation
      │
      ▼
SQLite WAL state
  ├── content_items
  ├── scenes
  ├── render_jobs
  ├── metrics
  ├── events
  └── idempotency_keys
      │
      ▼
Leased render worker
      │
      ▼
FFmpeg MP4 + thumbnail
      │
      ▼
Performance metrics + dashboard learning signals
```

Every content package moves through:

```text
queued → rendering → rendered → measured
                    ↘ failed
```

Render jobs are claimed with a lease token, retried up to three times, and fail closed. Expired leases are recovered transactionally. Every major transition writes an append-only event.

## Requirements

- Node.js 22 or newer
- FFmpeg and FFprobe
- Bash

No cloud model, API key, paid renderer, Docker daemon, or external database is required for the first slice. The production generator is deterministic and creates a six-scene operating narrative from validated topic, audience, objective, CTA, and duration inputs.

## Run

```bash
cd ~/CYVXAI-OS && \
bash ./scripts/content-os.sh start
```

Open:

```text
http://127.0.0.1:3050
```

Stop:

```bash
cd ~/CYVXAI-OS && \
bash ./scripts/content-os.sh stop
```

Status and logs:

```bash
cd ~/CYVXAI-OS && \
bash ./scripts/content-os.sh status && \
bash ./scripts/content-os.sh logs
```

## Verify the full production loop

The verifier launches an ephemeral API and SQLite database, creates a real content package through HTTP, proves idempotency, leases the render job, renders and probes an actual MP4, streams the media through the API, records performance, validates dashboard totals, validates the event chain, and removes the temporary workspace.

```bash
cd ~/CYVXAI-OS && \
npm run content:verify
```

Retain the verification workspace and MP4:

```bash
cd ~/CYVXAI-OS && \
CONTENT_OS_KEEP_VERIFY=1 npm run content:verify
```

## API

### Health

```http
GET /health
```

### Create and queue content

```http
POST /api/content
Idempotency-Key: unique-request-key
Content-Type: application/json

{
  "topic": "How local service businesses automate lead follow-up",
  "audience": "local service business owners",
  "objective": "generate qualified leads",
  "cta": "Book a CYVX revenue systems audit.",
  "durationSeconds": 42
}
```

### List content

```http
GET /api/content?limit=50
```

### Read one content package

```http
GET /api/content/:contentId
```

### Queue or retry a render

```http
POST /api/content/:contentId/render
```

### Record performance

```http
POST /api/content/:contentId/metrics
Content-Type: application/json

{
  "platform": "instagram",
  "impressions": 10000,
  "views": 6200,
  "watchSeconds": 151000,
  "completions": 2100,
  "clicks": 370,
  "leads": 42,
  "conversions": 8,
  "revenue": 1192
}
```

### Dashboard

```http
GET /api/dashboard
```

### Evidence events

```http
GET /api/content/:contentId/events
```

## Security

The one-command local runtime binds to `127.0.0.1` and explicitly enables local-only bypass. Binding to any non-loopback host requires a token of at least 32 characters and disables the bypass.

```bash
cd ~/CYVXAI-OS && \
CONTENT_OS_HOST=0.0.0.0 \
CONTENT_OS_API_TOKEN="replace-with-a-real-random-token-at-least-32-characters" \
bash ./scripts/content-os.sh start
```

Authenticated API requests accept:

```http
Authorization: Bearer <token>
```

or:

```http
X-API-Key: <token>
```

Generated media uses the same authorization boundary. The browser control room stores the token in session storage only. Logs redact keys whose names contain token, secret, authorization, API key, or password.

For public deployment, terminate HTTPS at the platform or reverse proxy, keep the API token in secret storage, mount the data directory to durable disk, and run the API and worker as separate supervised processes.

## Persistence and recovery

Default state:

```text
~/.cyvx/content-os/content-os.db
~/.cyvx/content-os/content-os.db-wal
~/.cyvx/content-os/content-os.db-shm
~/.cyvx/content-os/renders/
~/.cyvx/content-os/logs/
~/.cyvx/content-os/run/
```

SQLite runs with WAL, foreign keys, a busy timeout, and `BEGIN IMMEDIATE` transaction boundaries for state transitions. Render output paths and SHA-256 digests are persisted after FFprobe verification.

Backup the database and renders only while the runtime is stopped, or use SQLite's online backup facilities in a future operational PR.

## Commands

```text
npm run content             Start API and worker
npm run content:start       Start API and worker
npm run content:server      Run API in the foreground
npm run content:worker      Run worker in the foreground
npm run content:once        Process at most one queued render
npm run content:test        Run Content OS tests
npm run content:verify      Execute the real end-to-end verification
```

## Measured outputs

The measurement model calculates:

- View rate
- Retention rate against rendered duration
- Completion rate
- Click-through rate
- Lead rate
- Conversion rate
- Revenue per 1,000 views

This is the first learning input. A later slice can use the recorded hook, scene structure, CTA, platform, and economic outcomes to rank and generate the next content package without changing the durable contracts introduced here.
