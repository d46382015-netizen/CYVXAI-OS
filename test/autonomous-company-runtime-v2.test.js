"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMissionRuntime } = require("../runtime/missions");
const { AutonomousCompanyRuntime, RulesModelProvider, AGENT_DEFINITIONS } = require("../services/company-runtime");
const { createAutonomousCompanyHttpServer } = require("../services/company-runtime/server");

function fixture() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-autonomous-company-v2-"));
  const missionRuntime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  missionRuntime.logger = missionRuntime.logger || missionRuntime.store.logger;
  const runtime = new AutonomousCompanyRuntime(missionRuntime, {
    companyWorkspaceRoot: path.join(dataRoot, "companies"),
    intelligenceStatePath: path.join(dataRoot, "intelligence", "state.json"),
    model: { provider: new RulesModelProvider() },
    leaseMs: 10000,
  });
  const auth = { user_id: "admin-local", organization_id: "default", role: "admin", correlation_id: "autonomous-company-test" };
  return { missionRuntime, runtime, auth };
}

function companyInput(overrides = {}) {
  return {
    name: "CYVX Autonomous Revenue Company",
    description: "An owned company runtime that turns a bounded commercial objective into measurable execution and durable learning.",
    target_customer: "Service businesses that need repeatable revenue operations",
    offer: "Install an evidence-backed revenue operating system.",
    price_cents: 150000,
    location: "Minnesota",
    keywords: ["revenue", "operations", "service business"],
    outcome_contract: {
      objective: "Generate the first verified qualified lead",
      target_metric: "lead_count",
      comparator: ">=",
      target_value: 1,
      target_unit: "count",
      max_budget_cents: 0,
      approval_threshold_cents: 0,
      risk_level: "medium",
    },
    ...overrides,
  };
}

async function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

async function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function jsonRequest(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json();
  return { response, payload };
}

test("v2 creates, approves, executes, measures, learns, and persists a nine-agent company", async () => {
  const { missionRuntime, runtime, auth } = fixture();
  try {
    const created = runtime.createCompany(companyInput(), auth);
    assert.equal(created.team.status, "planned");
    assert.equal(created.team.model_provider, "rules");
    assert.equal(created.agents.length, AGENT_DEFINITIONS.length);
    assert.equal(created.tasks.length, 0);
    assert.equal(created.operator.company.status, "awaiting_approval");

    const approved = runtime.approveCompany(created.team.company_id, { decision_reason: "Owner approved bounded execution" }, auth);
    assert.equal(approved.team.status, "active");
    assert.equal(approved.tasks.length, 9);
    assert.ok(approved.tasks.every((task) => task.status === "pending"));

    const executed = await runtime.runToIdle(created.team.company_id, auth, 100);
    assert.equal(executed.company.team.status, "completed");
    assert.equal(executed.company.tasks.filter((task) => task.status === "completed").length, 9);
    assert.equal(executed.company.memories.length, 9);
    assert.ok(executed.company.operator.actions.every((action) => action.status === "completed"));
    assert.equal(executed.company.operator.mission.status, "learned");
    for (const task of executed.company.tasks) {
      assert.equal(fs.existsSync(task.artifact_path), true);
      assert.match(task.artifact_sha256, /^[a-f0-9]{64}$/);
      const artifact = JSON.parse(fs.readFileSync(task.artifact_path, "utf8"));
      assert.equal(artifact.company_id, created.team.company_id);
      assert.match(artifact.truth_boundary, /External execution/);
    }

    const outcome = runtime.recordOutcome(created.team.company_id, {
      metric_name: "qualified_lead_rate",
      value: 0.12,
      unit: "ratio",
      source: "verified-funnel-ledger",
      observed_result: "Twelve percent of captured leads met the qualification rule.",
      learning: "The strongest qualified intent came from evidence-first content.",
      next_hypothesis: "Adding delivery proof above the form will increase qualified intent without reducing total conversion.",
      evidence: { receipt: "funnel-cycle-001" },
    }, auth);
    assert.ok(outcome.metric_id);
    assert.equal(outcome.next_task.role, "growth");
    const improved = await runtime.runToIdle(created.team.company_id, auth, 20);
    assert.equal(improved.company.learnings.length, 1);
    assert.ok(improved.company.tasks.some((task) => task.kind.startsWith("growth.improve.") && task.status === "completed"));
  } finally {
    missionRuntime.close();
  }
});

test("outside-world webhooks are allowlisted, HMAC signed, and idempotent", async () => {
  const { missionRuntime, runtime, auth } = fixture();
  const secret = "production-test-secret-with-at-least-24-characters";
  process.env.CYVX_TEST_OUTSIDE_SECRET = secret;
  const received = [];
  const receiver = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    const expected = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
    received.push({ body, signature: request.headers["x-cyvx-signature"], idempotency: request.headers["idempotency-key"] });
    response.writeHead(request.headers["x-cyvx-signature"] === expected ? 200 : 401, { "content-type": "application/json" });
    response.end(JSON.stringify({ accepted: request.headers["x-cyvx-signature"] === expected }));
  });
  const address = await listen(receiver);
  try {
    const created = runtime.createCompany(companyInput({ name: "CYVX Integration Company" }), auth);
    const integration = runtime.registerIntegration(created.team.company_id, {
      name: "verified-crm",
      kind: "webhook",
      url: `http://127.0.0.1:${address.port}/events`,
      secret_env: "CYVX_TEST_OUTSIDE_SECRET",
      allowed_event_types: ["lead.qualified"],
    }, auth);
    await assert.rejects(() => runtime.dispatchIntegration(created.team.company_id, integration.id, {
      event_type: "payment.transfer", payload: {}, idempotency_key: "denied-event",
    }, auth), (error) => error.code === "INTEGRATION_EVENT_DENIED");

    const first = await runtime.dispatchIntegration(created.team.company_id, integration.id, {
      event_type: "lead.qualified", payload: { lead_id: "lead-001", qualification: "verified" }, idempotency_key: "lead-001-qualified",
    }, auth);
    assert.equal(first.status, "delivered");
    const second = await runtime.dispatchIntegration(created.team.company_id, integration.id, {
      event_type: "lead.qualified", payload: { lead_id: "lead-001", qualification: "verified" }, idempotency_key: "lead-001-qualified",
    }, auth);
    assert.equal(second.reused, true);
    assert.equal(received.length, 1);
    assert.match(received[0].signature, /^sha256=[a-f0-9]{64}$/);
  } finally {
    delete process.env.CYVX_TEST_OUTSIDE_SECRET;
    await close(receiver);
    missionRuntime.close();
  }
});

test("HTTP control room enforces bearer auth and exposes the complete production loop", async () => {
  const { missionRuntime, runtime } = fixture();
  const token = "http-test-company-runtime-token-that-is-long-enough";
  const server = createAutonomousCompanyHttpServer(runtime, { token, environment: "test" });
  const address = await server.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const page = await fetch(`${base}/control-room`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Nine-agent (team|company)/);

    const denied = await jsonRequest(base, "/api/v1/company-runtime/companies");
    assert.equal(denied.response.status, 401);

    const headers = { authorization: `Bearer ${token}` };
    const creation = await jsonRequest(base, "/api/v1/company-runtime/companies", {
      method: "POST", headers, body: JSON.stringify(companyInput({ name: "CYVX HTTP Autonomous Company" })),
    });
    assert.equal(creation.response.status, 201);
    const companyId = creation.payload.company.team.company_id;

    const approval = await jsonRequest(base, `/api/v1/company-runtime/companies/${companyId}/approve`, {
      method: "POST", headers, body: JSON.stringify({ decision_reason: "Approved by HTTP owner" }),
    });
    assert.equal(approval.response.status, 200);

    const execution = await jsonRequest(base, `/api/v1/company-runtime/companies/${companyId}/run`, {
      method: "POST", headers, body: JSON.stringify({ maximum_ticks: 100 }),
    });
    assert.equal(execution.response.status, 200);
    assert.equal(execution.payload.result.company.team.status, "completed");

    const publicLead = await jsonRequest(base, `/api/v1/company-runtime/companies/${companyId}/leads`, {
      method: "POST", body: JSON.stringify({ name: "Qualified Buyer", email: "buyer@example.com", message: "We need the operating system.", source: "control-room-test" }),
    });
    assert.equal(publicLead.response.status, 201);

    const graph = await jsonRequest(base, `/api/v1/company-runtime/companies/${companyId}`, { headers });
    assert.equal(graph.response.status, 200);
    assert.equal(graph.payload.company.operator.company.counters.leads_count, 1);
    assert.equal(graph.payload.company.operator.contract.status, "achieved");
  } finally {
    await server.close();
    missionRuntime.close();
  }
});
