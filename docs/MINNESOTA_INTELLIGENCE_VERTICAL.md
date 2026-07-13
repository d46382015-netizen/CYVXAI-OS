# CYVX Minnesota Procurement and Business Intelligence Vertical

Version: 1.0.0  
Jurisdiction: US-MN  
Owner: CYVX Intelligence Fabric

## Mission

Convert approved public Minnesota procurement and business sources into evidence-backed, scored revenue opportunities that can be searched, measured, imported, and converted into governed CYVX mission drafts.

The vertical implements:

`Observe → Verify → Normalize → Score → Qualify → Draft Mission → Measure`

## Production capabilities

- Official-source registry with jurisdiction, source type, URL, and reliability.
- Scheduled collection with timeouts, response-size limits, source health, and partial-failure recovery.
- HTML opportunity extraction, URL canonicalization, duplicate suppression, category detection, buyer inference, due-date parsing, value extraction, and configurable CYVX fit scoring.
- Durable atomic JSON storage under `~/.cyvx/intelligence/minnesota/` by default.
- Tamper-evident SHA-256 evidence records for every observed opportunity.
- JSONL operational logs with secret redaction.
- CSV/JSON import for SWIFT exports, municipal bid exports, vendor directories, and Minnesota business records.
- Searchable mobile-first dashboard and HTTP APIs.
- Bearer-token protection on every mutation.
- Mission drafts with acceptance tests, required evidence, human-approval boundary, and a durable mission outbox.
- Tests that do not require network access.

## Approved source registry

The default source registry includes:

1. Minnesota Office of State Procurement solicitations and contract opportunities.
2. Minnesota OSP goods and services opportunities.
3. Minnesota OSP professional and technical postings.
4. Minnesota Department of Administration construction solicitations and announcements.
5. MnDOT professional technical consultant services.
6. Minnesota OSP contracts expiring within seven months.
7. Minnesota OSP TG/ED/VO vendor directory.
8. Minnesota Secretary of State Business Filings Online as a verification destination.
9. Minnesota SWIFT Supplier Portal as the authoritative supplier and formal-solicitation destination.

Sources that require authentication, JavaScript interaction, a session, or an export are registered but are not bypassed or scraped. Their authorized CSV/JSON exports can be imported through the protected APIs.

## Run

Development or UserLAnd:

```bash
cd ~/CYVXAI-OS && \
CYVX_ALLOW_INSECURE_LOCAL=true npm run intel:mn
```

Production:

```bash
cd ~/CYVXAI-OS && \
export CYVX_MN_INTELLIGENCE_TOKEN="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))')" && \
npm run intel:mn
```

Start CYVXAI-OS and the Minnesota vertical together:

```bash
cd ~/CYVXAI-OS && \
export CYVX_MN_INTELLIGENCE_TOKEN="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))')" && \
npm run start:mn
```

Defaults:

- CYVX public runtime: `http://127.0.0.1:3000`
- Minnesota intelligence dashboard: `http://127.0.0.1:3010`
- Data: `~/.cyvx/intelligence/minnesota/state.json`
- Logs: `~/.cyvx/intelligence/minnesota/intelligence.jsonl`
- Mission outbox: `~/.cyvx/intelligence/minnesota/mission-outbox.jsonl`

## APIs

Read APIs:

- `GET /healthz`
- `GET /readyz`
- `GET /api/v1/intelligence/minnesota`
- `GET /api/v1/intelligence/minnesota/metrics`
- `GET /api/v1/intelligence/minnesota/sources`
- `GET /api/v1/intelligence/minnesota/opportunities?min_score=50&q=cleaning&category=facilities`
- `GET /api/v1/intelligence/minnesota/businesses?q=rochester`

Protected mutation APIs:

- `POST /api/v1/intelligence/minnesota/refresh`
- `POST /api/v1/intelligence/minnesota/opportunities/import`
- `POST /api/v1/intelligence/minnesota/businesses/import`
- `POST /api/v1/intelligence/minnesota/opportunities/:id/mission`

Use either:

```text
Authorization: Bearer <CYVX_MN_INTELLIGENCE_TOKEN>
```

or:

```text
x-cyvx-token: <CYVX_MN_INTELLIGENCE_TOKEN>
```

## Import a SWIFT or local-government export

CSV:

```bash
curl -fsS http://127.0.0.1:3010/api/v1/intelligence/minnesota/opportunities/import \
  -H "Authorization: Bearer $CYVX_MN_INTELLIGENCE_TOKEN" \
  -H "Content-Type: text/csv" \
  --data-binary @opportunities.csv
```

JSON with source metadata:

```bash
curl -fsS http://127.0.0.1:3010/api/v1/intelligence/minnesota/opportunities/import \
  -H "Authorization: Bearer $CYVX_MN_INTELLIGENCE_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "metadata": {
      "source_id": "mn_swift_export",
      "source_name": "Minnesota SWIFT authorized export",
      "source_url": "https://guest.supplier.systems.state.mn.us/",
      "reliability": 0.97
    },
    "records": [
      {
        "title": "Example facilities solicitation",
        "agency": "State of Minnesota",
        "due_date": "2026-08-15",
        "value": 75000,
        "category": "facilities",
        "source_url": "https://example.invalid/replace-with-official-record"
      }
    ]
  }'
```

## Create a governed revenue mission

```bash
OPPORTUNITY_ID="mnopp_replace_me" && \
curl -fsS -X POST \
  "http://127.0.0.1:3010/api/v1/intelligence/minnesota/opportunities/$OPPORTUNITY_ID/mission" \
  -H "Authorization: Bearer $CYVX_MN_INTELLIGENCE_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"organization_id":"cyvx"}'
```

The mission remains a draft. It does not submit a bid, contact a buyer, spend money, or make an external commitment. The outbox event is available for the CYVX mission bridge and preserves the opportunity evidence.

## Scoring model

The 0–100 score currently combines:

- Match against the CYVX revenue profile service keywords.
- Geographic relevance.
- Source and signal type.
- Published or inferred contract value.
- Deadline timing.
- Source reliability.

Bands:

- `75–100`: priority
- `50–74`: qualified
- `35–49`: watch
- `0–34`: low

Configure additional sources without changing code:

```bash
export CYVX_MN_EXTRA_SOURCES_JSON='[
  {
    "id":"city_example_bids",
    "name":"Example Minnesota City Bids",
    "kind":"procurement",
    "jurisdiction":"US-MN",
    "url":"https://example.gov/bids",
    "reliability":0.9,
    "collect":true
  }
]'
```

Only HTTPS sources are accepted.

## Validation

```bash
cd ~/CYVXAI-OS && \
node --check services/intelligence/minnesota/index.js && \
node --check services/intelligence/minnesota/server.js && \
node --test test/minnesota-intelligence.test.js
```

Expected result: five tests pass with zero failures.

## Operations

Important environment variables:

| Variable | Default | Purpose |
|---|---:|---|
| `CYVX_MN_INTELLIGENCE_PORT` | `3010` | HTTP port |
| `CYVX_MN_INTELLIGENCE_HOST` | `0.0.0.0` | Listen host |
| `CYVX_MN_INTELLIGENCE_TOKEN` | none | Required production mutation token |
| `CYVX_MN_AUTO_REFRESH` | `true` | Enable scheduled refresh |
| `CYVX_MN_REFRESH_ON_START` | `true` | Refresh after startup |
| `CYVX_MN_REFRESH_INTERVAL_MS` | `21600000` | Six-hour refresh cadence |
| `CYVX_MN_FETCH_TIMEOUT_MS` | `20000` | Per-source timeout |
| `CYVX_MN_BODY_LIMIT` | `2097152` | Import request limit |
| `CYVX_DATA_ROOT` | `~/.cyvx` | Shared CYVX data root |
| `CYVX_MN_EXTRA_SOURCES_JSON` | `[]` | Additional approved HTTPS sources |

Source failures do not erase previously collected records from other sources. A successful source refresh replaces that source's prior extracted records, preventing stale duplication. Failed sources remain visible as degraded with their last error and consecutive-failure count.

## Governance and legal boundaries

- Publicly available data and authorized exports only.
- No authentication bypass, credential harvesting, access-control circumvention, or hidden tracking.
- Official records remain authoritative; extracted deadlines and values must be verified before bid work.
- AI or heuristic classifications are stored separately from observed evidence.
- No consequential external action occurs without human approval.
- Source terms, robots directives, rate limits, and data-retention requirements must be respected.
