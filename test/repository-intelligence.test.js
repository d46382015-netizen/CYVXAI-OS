"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createRepositoryIntelligence } = require("../services/repository-intelligence");
const { createRepositoryIntelligenceServer } = require("../services/repository-intelligence/server");

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-repository-fixture-"));
  const dataRoot = path.join(root, ".state");
  const contract = {
    version: "test-1",
    minimum_node_major: 22,
    source_roots: ["api", "services", "scripts"],
    required_paths: ["package.json", "README.md", "api", "services", "scripts", "test", "docs", ".github/workflows"],
    required_scripts: ["start", "test", "verify"],
    targets: { max_top_level_directories: 10, max_unclassified_directories: 2, minimum_tests: 1, minimum_workflows: 1, minimum_documents: 1, minimum_test_to_source_ratio: 0.1, mission_task_limit: 4 },
    weights: { architecture: 1, runtime: 1, verification: 1, security: 1, automation: 1, documentation: 1, product: 1, maintainability: 1, evidence: 1, learning: 1 },
    categories: { core: ["api", "services", "scripts", "test", "docs"] },
    ignored_top_level: [],
    secret_scan_roots: ["api", "services", "scripts"],
    proof_paths: ["docs"],
    capabilities: [{ id: "api", title: "API", paths: ["api/index.js"], required_scripts: ["start"] }],
  };
  write(root, "package.json", JSON.stringify({ name: "fixture", version: "1.0.0", engines: { node: ">=22" }, scripts: { start: "node api/index.js", test: "node --test", verify: "node scripts/verify.js" } }, null, 2));
  write(root, "package-lock.json", JSON.stringify({ name: "fixture", version: "1.0.0", lockfileVersion: 3, packages: { "": { name: "fixture", version: "1.0.0" } } }, null, 2));
  write(root, "README.md", "# Fixture 1.0.0\n");
  write(root, "api/index.js", "module.exports = { ok: true };\n");
  write(root, "services/example.js", "module.exports = function example() { return true; };\n");
  write(root, "scripts/verify.js", "process.stdout.write('ok\\n');\n");
  write(root, "test/example.test.js", "// fixture test\n");
  write(root, "docs/OPERATIONS.md", "# Operations\n");
  write(root, ".github/workflows/ci.yml", "name: ci\non: [push]\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n");
  return { root, dataRoot, contract };
}

function write(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function request(port, method, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, body: res.headers["content-type"] && res.headers["content-type"].includes("json") ? JSON.parse(text) : text });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("repository intelligence persists scored proof and history", () => {
  const fixture = createFixture();
  const intelligence = createRepositoryIntelligence(fixture);
  const first = intelligence.scan();
  const second = intelligence.scan();
  assert.equal(first.summary.critical, 0);
  assert.ok(first.readiness_score >= 80, JSON.stringify(first.checks.filter((check) => check.status !== "pass"), null, 2));
  assert.match(first.proof.digest, /^[a-f0-9]{64}$/);
  assert.equal(intelligence.latest().proof.digest, second.proof.digest);
  assert.equal(intelligence.history().length, 2);
  assert.ok(fs.existsSync(path.join(fixture.dataRoot, "latest.md")));
});

test("repository intelligence detects workflow runtime drift", () => {
  const fixture = createFixture();
  write(fixture.root, ".github/workflows/ci.yml", "name: ci\non: [push]\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n");
  const snapshot = createRepositoryIntelligence(fixture).scan({ persist: false });
  const finding = snapshot.checks.find((check) => check.id === "workflow-node-consistency");
  assert.equal(finding.status, "fail");
  assert.equal(finding.severity, "high");
  assert.deepEqual(finding.evidence, [20]);
  assert.equal(snapshot.next_best_action.id, "workflow-node-consistency");
});

test("repository intelligence serves health, API, metrics, and governed scans", async (t) => {
  const fixture = createFixture();
  const runtime = createRepositoryIntelligenceServer({ ...fixture, host: "127.0.0.1", port: 0, allowInsecureLocal: true });
  await runtime.listen();
  t.after(() => runtime.close());
  const port = runtime.server.address().port;
  const health = await request(port, "GET", "/healthz");
  assert.equal(health.status, 200);
  assert.equal(health.body.service, "cyvx-repository-intelligence");
  const api = await request(port, "GET", "/api/v1/repository-intelligence");
  assert.equal(api.status, 200);
  assert.match(api.body.proof.digest, /^[a-f0-9]{64}$/);
  const scan = await request(port, "POST", "/api/v1/repository-intelligence/scan");
  assert.equal(scan.status, 201);
  const metrics = await request(port, "GET", "/metrics");
  assert.equal(metrics.status, 200);
  assert.match(metrics.body, /cyvx_repository_readiness_score/);
});
