"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createFieldManualServer } = require("../services/content-growth/server");

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-field-security-"));
}

test("provider readiness is sanitized and missing secrets fail closed", async (t) => {
  const runtime = createFieldManualServer({ port: 0, dataDirectory: tempDirectory(), logger: { error() {} } });
  const address = await runtime.start();
  t.after(() => runtime.close());
  const base = `http://127.0.0.1:${address.port}`;

  const readinessResponse = await fetch(`${base}/api/v1/readiness`);
  assert.equal(readinessResponse.status, 200);
  assert.deepEqual((await readinessResponse.json()).providers, {
    manychat_webhook: false,
    kit_api: false,
    kit_tags: { GENERAL_OPERATOR: false, SECURITY: false, MOBILE_BUILD: false },
    lemon_checkout: false,
    lemon_webhook: false,
    admin_metrics: false,
  });

  const manychatResponse = await fetch(`${base}/api/v1/webhooks/manychat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "operator@example.com", keyword: "MANUAL" }),
  });
  assert.equal(manychatResponse.status, 503);

  const metricsResponse = await fetch(`${base}/api/v1/metrics`);
  assert.equal(metricsResponse.status, 503);
});
