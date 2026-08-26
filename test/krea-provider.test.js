"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { KreaProvider, validateGeneration, validateJobId, normalizeBase } = require("../core/integrations/krea_provider");

test("Krea provider reports unconfigured without leaking credentials", () => {
  const provider = new KreaProvider({ env: {}, auditFile: tempAudit() });
  const snapshot = provider.snapshot();
  assert.equal(snapshot.configured, false);
  assert.equal(snapshot.token_configured, false);
  assert.equal(snapshot.mcp_endpoint, "https://api.krea.ai/mcp");
});

test("Krea generation validation accepts supported model paths", () => {
  const value = validateGeneration({
    model: "image/krea/krea-2/medium",
    input: { prompt: "production test", aspect_ratio: "16:9", resolution: "1K" },
  });
  assert.equal(value.model, "image/krea/krea-2/medium");
  assert.equal(value.input.aspect_ratio, "16:9");
});

test("Krea validation rejects path traversal and malformed jobs", () => {
  assert.throws(() => validateGeneration({ model: "https/evil", input: {} }), /valid Krea image\/video\/enhance model path/);
  assert.throws(() => validateGeneration({ model: "image/../evil/x", input: {} }), /valid Krea image\/video\/enhance model path/);
  assert.throws(() => validateJobId("bad"), /invalid Krea job id/);
  assert.equal(normalizeBase("https://api.krea.ai/"), "https://api.krea.ai");
  assert.throws(() => normalizeBase("http://api.krea.ai"), /must use HTTPS/);
});

test("Krea provider submits and polls jobs with bearer auth", async () => {
  const calls = [];
  let poll = 0;
  const auditFile = tempAudit();
  const provider = new KreaProvider({
    env: { KREA_API_TOKEN: "secret-test-token" },
    auditFile,
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/generate/image/krea/krea-2/medium")) {
        return response({ job_id: "550e8400-e29b-41d4-a716-446655440000", status: "queued" });
      }
      poll += 1;
      return response(poll === 1 ? { job_id: "550e8400-e29b-41d4-a716-446655440000", status: "processing" } : { job_id: "550e8400-e29b-41d4-a716-446655440000", status: "completed", result: { urls: ["https://gen.krea.ai/test.png"] } });
    },
  });
  const submitted = await provider.generate({ model: "image/krea/krea-2/medium", input: { prompt: "test" } }, { tenant_id: "t1", user_id: "u1" });
  assert.equal(submitted.status, "queued");
  const completed = await provider.wait(submitted.job_id, { timeoutMs: 5_000, intervalMs: 1 }, { tenant_id: "t1", user_id: "u1" });
  assert.equal(completed.status, "completed");
  assert.equal(calls[0].options.headers.authorization, "Bearer secret-test-token");
  const audit = fs.readFileSync(auditFile, "utf8");
  assert.match(audit, /"operation":"generate"/);
  assert.doesNotMatch(audit, /secret-test-token/);
});

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

function tempAudit() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-krea-")), "events.jsonl");
}
