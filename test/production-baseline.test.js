"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Telemetry } = require("../core/observability/telemetry");
const { assertProductionSecurity, authorizeRequest, inspectProductionSecurity } = require("../core/security/production_guard");
const { ManagedDataPlane } = require("../core/storage/managed_data_plane");
const { verify: verifyProductionBaseline } = require("../scripts/verify-production-baseline");

const SECURE_ENV = {
  NODE_ENV: "production",
  CYVX_ENV: "production",
  CYVX_API_KEY: "api-key-abcdefghijklmnopqrstuvwxyz-123456",
  CYVX_OWNER_ID: "dakota-production-owner",
  CYVX_OPERATOR_SESSION_SECRET: "session-secret-abcdefghijklmnopqrstuvwxyz-123456",
  APP_BASE_URL: "https://cyvx.example.net",
  CYVX_ALLOW_INSECURE_LOCAL: "false",
};

test("production configuration fails closed when secrets are absent", () => {
  const result = inspectProductionSecurity({ NODE_ENV: "production" });
  assert.equal(result.ok, false);
  assert.ok(result.failed.includes("CYVX_API_KEY"));
  assert.throws(() => assertProductionSecurity({ NODE_ENV: "production" }), { code: "CYVX_PRODUCTION_SECURITY_INVALID" });
});

test("production configuration accepts strong non-placeholder secrets", () => {
  const result = assertProductionSecurity(SECURE_ENV);
  assert.equal(result.ok, true);
  assert.equal(result.production, true);
});

test("authorization never opens production when the API key is absent", () => {
  const request = { headers: {} };
  assert.equal(authorizeRequest(request, { NODE_ENV: "production" }), false);
  assert.equal(authorizeRequest(request, { NODE_ENV: "development" }), false);
  assert.equal(authorizeRequest(request, { NODE_ENV: "development", CYVX_ALLOW_INSECURE_LOCAL: "true" }), true);
});

test("authorization accepts matching header and rejects mismatched bearer token", () => {
  const env = { NODE_ENV: "production", CYVX_API_KEY: SECURE_ENV.CYVX_API_KEY };
  assert.equal(authorizeRequest({ headers: { "x-api-key": SECURE_ENV.CYVX_API_KEY } }, env), true);
  assert.equal(authorizeRequest({ headers: { authorization: `Bearer ${SECURE_ENV.CYVX_API_KEY}` } }, env), true);
  assert.equal(authorizeRequest({ headers: { authorization: "Bearer wrong" } }, env), false);
});

test("telemetry writes structured redacted logs and retains runtime metrics", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-telemetry-"));
  const logPath = path.join(directory, "runtime.jsonl");
  const telemetry = new Telemetry({ logPath, maxLogBytes: 1024, maxLogFiles: 2, environment: "test" });
  telemetry.log("info", "test.event", { authorization: "Bearer super-secret", safe: "value" });
  telemetry.increment("work_total", 2);
  telemetry.gauge("queue_depth", 3);
  const span = telemetry.startSpan("test.operation", { component: "test" });
  span.end("ok");
  const content = fs.readFileSync(logPath, "utf8");
  assert.match(content, /"event":"test.event"/);
  assert.match(content, /"authorization":"\[redacted\]"/);
  assert.equal(telemetry.snapshot().counters.work_total, 2);
  assert.equal(telemetry.snapshot().gauges.queue_depth, 3);
  assert.equal(telemetry.snapshot().recent_spans.length, 1);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("managed PostgreSQL data plane reports required missing configuration as unhealthy", async () => {
  const plane = new ManagedDataPlane({ env: { CYVX_REQUIRE_MANAGED_DATA: "true" } });
  const health = await plane.health();
  assert.equal(health.configured, false);
  assert.equal(health.healthy, false);
  assert.equal(health.required, true);
});

test("production baseline accepts the authoritative CI verification entrypoint", () => {
  const result = verifyProductionBaseline();
  assert.equal(result.ok, true);
  assert.equal(result.failed.length, 0);
  assert.equal(result.checks.find((item) => item.key === "ci:baseline_gate").ok, true);
});
