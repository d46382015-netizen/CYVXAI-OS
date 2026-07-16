"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createTopologyConsolidation, buildDependencyGraph, rewriteContent } = require("../services/topology-consolidation");
const { createTopologyConsolidationServer } = require("../services/topology-consolidation/server");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-topology-"));
  const dataRoot = path.join(root, ".state");
  fs.mkdirSync(path.join(root, "physics"), { recursive: true });
  fs.mkdirSync(path.join(root, "api"), { recursive: true });
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  fs.writeFileSync(path.join(root, "physics", "index.js"), "module.exports = { answer: 42 };\n");
  fs.writeFileSync(path.join(root, "api", "app.js"), "module.exports = require('../physics');\n");
  fs.writeFileSync(path.join(root, "README.md"), "Run ./physics and inspect physics/index.js.\n");
  const config = {
    version: "test",
    alias_strategy: "symlink",
    exclude: [".state"],
    protected_roots: ["api", "config"],
    verification: { quick: [], full: [] },
    stop_conditions: [],
    stages: [{ id: "research", title: "Research", description: "fixture", risk: "low", moves: [{ source: "physics", target: "research/physics" }] }],
  };
  fs.writeFileSync(path.join(root, "config", "topology-consolidation.json"), `${JSON.stringify(config, null, 2)}\n`);
  return { root, dataRoot, config };
}

function request(port, method, pathname, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers: { ...(payload ? { "content-type": "application/json", "content-length": payload.length } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test("dependency graph resolves local imports and rewrite maps future paths", () => {
  const { root, config } = fixture();
  const files = ["api/app.js", "physics/index.js"];
  const graph = buildDependencyGraph(root, files);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].to, "physics/index.js");
  const rewritten = rewriteContent(root, "api/app.js", fs.readFileSync(path.join(root, "api/app.js"), "utf8"), [{ source: "physics", target: "research/physics" }]);
  assert.match(rewritten, /\.\.\/research\/physics/);
  assert.doesNotMatch(rewritten, /research\/research/);
  assert.equal(config.stages[0].id, "research");
});

test("approved stage applies aliases and rewrites, then rollback proves exact restoration", () => {
  const { root, dataRoot, config } = fixture();
  const topology = createTopologyConsolidation({ root, dataRoot, config, requireClean: false });
  const plan = topology.plan("research");
  assert.equal(plan.ok, true);
  assert.equal(plan.summary.active_moves, 1);
  assert.throws(() => topology.apply("research", { approvalDigest: "wrong", verifyMode: "none" }), /digest approval/i);

  const applied = topology.apply("research", { approvalDigest: plan.approval.digest, verifyMode: "none" });
  assert.equal(applied.status, "applied");
  assert.equal(fs.lstatSync(path.join(root, "physics")).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(path.join(root, "physics")), "research/physics");
  assert.equal(fs.existsSync(path.join(root, "research", "physics", "index.js")), true);
  assert.match(fs.readFileSync(path.join(root, "api", "app.js"), "utf8"), /research\/physics/);
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /research\/physics/);
  assert.equal(topology.verifyRun(applied.run_id).ok, true);

  const rolledBack = topology.rollback(applied.run_id);
  assert.equal(rolledBack.status, "rolled_back");
  assert.equal(rolledBack.rollback.verified, true);
  assert.equal(fs.lstatSync(path.join(root, "physics")).isDirectory(), true);
  assert.equal(fs.existsSync(path.join(root, "research", "physics")), false);
  assert.match(fs.readFileSync(path.join(root, "api", "app.js"), "utf8"), /\.\.\/physics/);
  assert.equal(topology.verifyRun(applied.run_id).ok, true);
});

test("verification failure automatically rolls back", () => {
  const { root, dataRoot, config } = fixture();
  config.verification.quick = ["exit 17"];
  const topology = createTopologyConsolidation({ root, dataRoot, config, requireClean: false });
  const plan = topology.plan("research");
  assert.throws(() => topology.apply("research", { approvalDigest: plan.approval.digest, verifyMode: "quick" }), /Verification command failed/);
  assert.equal(fs.existsSync(path.join(root, "physics", "index.js")), true);
  assert.equal(fs.existsSync(path.join(root, "research", "physics")), false);
  assert.match(fs.readFileSync(path.join(root, "api", "app.js"), "utf8"), /\.\.\/physics/);
  const history = topology.listRuns();
  assert.equal(history.some((entry) => entry.status === "rolled_back"), true);
});

test("HTTP control plane exposes safe plans and protects mutations", async (t) => {
  const { root, dataRoot, config } = fixture();
  const topology = createTopologyConsolidation({ root, dataRoot, config, requireClean: false });
  const runtime = createTopologyConsolidationServer({ topology, token: "topology-test-token-long", allowInsecureLocal: false });
  await runtime.listen(0, "127.0.0.1");
  t.after(() => runtime.close());
  const port = runtime.server.address().port;
  const health = await request(port, "GET", "/healthz");
  assert.equal(health.status, 200);
  const plan = await request(port, "GET", "/api/v1/topology/plan?stage=research");
  assert.equal(plan.status, 200);
  assert.equal(plan.body.ok, true);
  const denied = await request(port, "POST", "/api/v1/topology/apply", { stage_id: "research", approval_digest: plan.body.approval.digest, verify_mode: "none" });
  assert.equal(denied.status, 401);
  const applied = await request(port, "POST", "/api/v1/topology/apply", { stage_id: "research", approval_digest: plan.body.approval.digest, verify_mode: "none" }, "topology-test-token-long");
  assert.equal(applied.status, 201);
  assert.equal(applied.body.run.status, "applied");
  const rollback = await request(port, "POST", "/api/v1/topology/rollback", { run_id: applied.body.run.run_id }, "topology-test-token-long");
  assert.equal(rollback.status, 200);
  assert.equal(rollback.body.run.rollback.verified, true);
});
