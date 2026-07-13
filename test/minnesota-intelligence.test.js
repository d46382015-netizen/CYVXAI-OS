"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createMinnesotaIntelligence,
  extractOpportunities,
  parseCsv,
} = require("../services/intelligence/minnesota");
const { createMinnesotaIntelligenceServer } = require("../services/intelligence/minnesota/server");

const FIXTURE = `<!doctype html><html><body>
<h1>Current Opportunities</h1>
<section><p>Minnesota Department of Administration</p><a href="/rfp/facility-cleaning.pdf">RFP — Statewide Facility Cleaning Services</a><p>Responses due August 15, 2026. Estimated value $250,000.</p></section>
<section><a href="https://example.test/technology-rfq">RFQ for Workflow Automation and Reporting Dashboard</a><p>Proposal due 09/01/2026 for the City of Rochester.</p></section>
<a href="/about">About</a>
</body></html>`;

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-mn-intel-"));
}

function fakeResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async text() { return body; } };
}

test("extracts, normalizes, scores, and preserves evidence", () => {
  const source = {
    id: "fixture_source",
    name: "Fixture Source",
    kind: "procurement",
    jurisdiction: "US-MN",
    url: "https://example.test/opportunities",
    reliability: 0.95,
    collect: true,
  };
  const profile = {
    name: "test",
    service_keywords: ["cleaning", "facility", "automation", "dashboard"],
    preferred_regions: ["Minnesota", "Rochester"],
    minimum_score: 35,
    maximum_days_to_due: 120,
  };
  const rows = extractOpportunities(FIXTURE, source, profile, new Date("2026-07-12T12:00:00Z"));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].jurisdiction, "US-MN");
  assert.match(rows[0].evidence.content_hash, /^[a-f0-9]{64}$/);
  assert.ok(rows.some((row) => row.category === "facilities"));
  assert.ok(rows.some((row) => row.category === "technology"));
  assert.ok(rows.every((row) => row.score >= 35));
});

test("refresh persists opportunities and fails soft when another source is unavailable", async () => {
  const root = tempRoot();
  const sources = [
    { id: "healthy", name: "Healthy", kind: "procurement", jurisdiction: "US-MN", url: "https://healthy.test", reliability: 0.95, collect: true },
    { id: "failed", name: "Failed", kind: "procurement", jurisdiction: "US-MN", url: "https://failed.test", reliability: 0.95, collect: true },
  ];
  const intelligence = createMinnesotaIntelligence({
    root,
    sources,
    clock: () => new Date("2026-07-12T12:00:00Z"),
    fetch: async (url) => {
      if (url.includes("failed")) return fakeResponse("unavailable", 503);
      return fakeResponse(FIXTURE);
    },
  });
  const result = await intelligence.refresh({ sourceIds: ["healthy", "failed"] });
  assert.equal(result.ok, true);
  assert.equal(result.partial, true);
  assert.equal(result.sources_ok, 1);
  const snapshot = intelligence.snapshot();
  assert.equal(snapshot.source_health.healthy.ok, true);
  assert.equal(snapshot.source_health.failed.ok, false);
  assert.ok(snapshot.opportunities.length >= 2);
  assert.ok(fs.existsSync(path.join(root, "state.json")));
  assert.ok(fs.existsSync(path.join(root, "intelligence.jsonl")));
});

test("imports CSV records and drafts a mission with an outbox event", async () => {
  const root = tempRoot();
  const intelligence = createMinnesotaIntelligence({ root, sources: [], clock: () => new Date("2026-07-12T12:00:00Z") });
  const csv = "title,agency,due_date,value,category,source_url\nJanitorial Contract,Olmsted County,2026-08-20,85000,facilities,https://example.test/janitorial\n";
  const importResult = await intelligence.importOpportunities(csv, { source_id: "fixture_csv", source_name: "Fixture CSV" });
  assert.equal(importResult.imported, 1);
  const opportunity = intelligence.listOpportunities()[0];
  assert.equal(opportunity.buyer, "Olmsted County");
  const missionResult = await intelligence.createMission(opportunity.id, { organization_id: "cyvx" });
  assert.equal(missionResult.mission.type, "revenue.bid_capture");
  assert.equal(missionResult.mission.state, "draft");
  assert.ok(fs.readFileSync(path.join(root, "mission-outbox.jsonl"), "utf8").includes("intelligence.mission_drafted"));
});

test("CSV parser handles quoted commas and escaped quotes", () => {
  const rows = parseCsv('name,notes\n"Acme, LLC","Says ""hello"""\n');
  assert.deepEqual(rows, [{ name: "Acme, LLC", notes: 'Says "hello"' }]);
});

test("HTTP service exposes read APIs and protects mutations", async (t) => {
  const root = tempRoot();
  const intelligence = createMinnesotaIntelligence({
    root,
    sources: [{ id: "fixture", name: "Fixture", kind: "procurement", jurisdiction: "US-MN", url: "https://example.test", reliability: 0.95, collect: true }],
    fetch: async () => fakeResponse(FIXTURE),
    clock: () => new Date("2026-07-12T12:00:00Z"),
  });
  const runtime = createMinnesotaIntelligenceServer({ intelligence, token: "test-secret", autoRefresh: false, port: 0, host: "127.0.0.1" });
  await new Promise((resolve, reject) => runtime.server.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve()));
  t.after(() => runtime.close());
  const port = runtime.server.address().port;

  const health = await request(port, "GET", "/healthz");
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);

  const denied = await request(port, "POST", "/api/v1/intelligence/minnesota/refresh", {});
  assert.equal(denied.status, 401);

  const allowed = await request(port, "POST", "/api/v1/intelligence/minnesota/refresh", {}, { authorization: "Bearer test-secret" });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.sources_ok, 1);

  const opportunities = await request(port, "GET", "/api/v1/intelligence/minnesota/opportunities?min_score=35");
  assert.equal(opportunities.status, 200);
  assert.ok(opportunities.body.total >= 2);
});

function request(port, method, requestPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method,
      headers: {
        ...(payload ? { "content-type": "application/json", "content-length": payload.length } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
