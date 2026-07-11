"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMissionRuntime, createMissionHttpServer } = require("../runtime/missions");
const { now } = require("../runtime/missions/base");

const AUTH_SECRET = "test-runtime-secret-that-is-long-enough-123456789";

function temporaryRoot(prefix = "cyvx-mission-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedOrganization(runtime, organizationId, users = {}) {
  const timestamp = now();
  runtime.db.prepare("INSERT OR IGNORE INTO organizations(id,name,created_at,updated_at) VALUES(?,?,?,?)")
    .run(organizationId, `${organizationId} Organization`, timestamp, timestamp);
  for (const [userId, role] of Object.entries(users)) {
    runtime.db.prepare(`INSERT OR REPLACE INTO users(id,organization_id,role,active,created_at,updated_at)
      VALUES(?,?,?,?,?,?)`).run(userId, organizationId, role, 1, timestamp, timestamp);
  }
}

async function createHarness(options = {}) {
  const dataRoot = options.dataRoot || temporaryRoot();
  const runtime = createMissionRuntime({
    dataRoot,
    authSecret: AUTH_SECRET,
    allowLocalAuth: true,
    leaseMs: options.leaseMs || 250,
    workerFreshMs: options.workerFreshMs || 2000,
    mutationLimit: options.mutationLimit || 1000,
    authLimit: options.authLimit || 1000,
    bodyLimit: options.bodyLimit || 64 * 1024,
    corsAllowlist: options.corsAllowlist || "http://allowed.test",
  });
  seedOrganization(runtime, "org-a", {
    "admin-a": "admin",
    "approver-a": "approver",
    "agent-a": "agent",
    "viewer-a": "viewer",
  });
  seedOrganization(runtime, "org-b", {
    "admin-b": "admin",
    "approver-b": "approver",
    "agent-b": "agent",
    "viewer-b": "viewer",
  });
  const httpRuntime = createMissionHttpServer(runtime);
  const address = await httpRuntime.listen(0, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const tokens = {};
  for (const [organizationId, users] of Object.entries({
    "org-a": { "admin-a": "admin", "approver-a": "approver", "agent-a": "agent", "viewer-a": "viewer" },
    "org-b": { "admin-b": "admin", "approver-b": "approver", "agent-b": "agent", "viewer-b": "viewer" },
  })) {
    for (const [userId, role] of Object.entries(users)) {
      tokens[userId] = runtime.issueToken({ sub: userId, organization_id: organizationId, role }, 3600);
    }
  }

  return {
    dataRoot,
    runtime,
    httpRuntime,
    baseUrl,
    tokens,
    async close() {
      await httpRuntime.close();
      runtime.close();
      if (!options.keepData) fs.rmSync(dataRoot, { recursive: true, force: true });
    },
  };
}

async function request(harness, method, pathname, token, body, headers = {}) {
  const options = { method, headers: { ...headers } };
  if (token) options.headers.authorization = `Bearer ${token}`;
  if (body !== undefined) {
    options.headers["content-type"] = "application/json";
    options.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const response = await fetch(`${harness.baseUrl}${pathname}`, options);
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; }
  catch { payload = { raw: text }; }
  return { response, status: response.status, payload, text };
}

async function expectStatus(promise, status, code) {
  const result = await promise;
  assert.equal(result.status, status, result.text);
  if (code) assert.equal(result.payload && result.payload.error, code, result.text);
  return result;
}

async function createApprovedQueuedMission(harness, options = {}) {
  const admin = harness.tokens[options.admin || "admin-a"];
  const approver = harness.tokens[options.approver || "approver-a"];
  const agentId = options.agentId || "agent-a";
  const correlationId = options.correlationId || `corr-${Date.now()}-${Math.random()}`;
  const headers = { "x-correlation-id": correlationId };

  const created = await expectStatus(request(harness, "POST", "/api/v1/missions", admin, {
    title: options.title || "Runtime verification mission",
    objective: options.objective || "Prove durable mission execution",
    organization_id: "malicious-client-org",
    created_by: "malicious-client-actor",
    role: "admin",
    constraints: ["restart safe"],
    success_metrics: [{ key: "completed", target: 1 }],
    approval_required: true,
  }, headers), 201);
  const mission = created.payload.mission;
  const validated = await expectStatus(request(harness, "POST", `/api/v1/missions/${mission.id}/validate`, admin, {
    feasible: true,
    assumptions: ["local deterministic runtime"],
  }, headers), 200);
  assert.equal(validated.payload.mission.status, "validated");
  const planned = await expectStatus(request(harness, "POST", `/api/v1/missions/${mission.id}/plan`, admin, {
    actions: [{ step: 1, description: "Execute deterministic capability" }],
    dependencies: [],
    estimated_duration_minutes: 1,
    resource_requirements: { runtime: "local" },
  }, headers), 200);
  assert.equal(planned.payload.mission.status, "planned");
  const requested = await expectStatus(request(harness, "POST", `/api/v1/missions/${mission.id}/approval-request`, admin, {
    reason: "Runtime verification gate",
  }, headers), 201);
  const approval = requested.payload.approval;
  const approved = await expectStatus(request(harness, "POST", `/api/v1/approvals/${approval.id}/decide`, approver, {
    decision: "approved",
    decision_reason: "Verified bounded execution",
  }, headers), 200);
  assert.equal(approved.payload.mission.status, "approved");
  const assigned = await expectStatus(request(harness, "POST", `/api/v1/missions/${mission.id}/assign-agent`, admin, {
    agent_id: agentId,
  }, headers), 200);
  assert.equal(assigned.payload.mission.status, "queued");
  return { mission: assigned.payload.mission, approval, correlationId };
}

async function queueMission(harness, missionId, options = {}) {
  const token = harness.tokens[options.agent || "agent-a"];
  const idempotencyKey = options.idempotencyKey || `execute:${missionId}`;
  return expectStatus(request(harness, "POST", `/api/v1/missions/${missionId}/execute`, token, {
    steps: [{ name: "deterministic", status: "pending" }],
  }, {
    "idempotency-key": idempotencyKey,
    "x-correlation-id": options.correlationId || `corr-execute-${missionId}`,
    "x-causation-id": options.causationId || `approval:${missionId}`,
  }), 202);
}

async function waitFor(predicate, timeoutMs = 5000, intervalMs = 25) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition was not met within ${timeoutMs}ms`);
}

module.exports = {
  AUTH_SECRET,
  createHarness,
  createApprovedQueuedMission,
  expectStatus,
  queueMission,
  request,
  seedOrganization,
  temporaryRoot,
  waitFor,
};
