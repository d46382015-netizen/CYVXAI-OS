"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMissionRuntime } = require("../runtime/missions");
const { AutonomousCompanyRuntime, RulesModelProvider } = require("../services/company-runtime");
const { createAutonomousCompanyHttpServer, publicCompanySnapshot, normalizePublicLead } = require("../services/company-runtime/server");
const { renderPublicSite, renderControlRoom } = require("../services/company-runtime/ui");

function fixture() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-company-experience-"));
  const missionRuntime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  missionRuntime.logger = missionRuntime.logger || missionRuntime.store.logger;
  const runtime = new AutonomousCompanyRuntime(missionRuntime, {
    companyWorkspaceRoot: path.join(dataRoot, "companies"),
    intelligenceStatePath: path.join(dataRoot, "intelligence", "state.json"),
    model: { provider: new RulesModelProvider() },
    leaseMs: 10000,
  });
  const auth = { user_id: "experience-admin", organization_id: "default", role: "admin", correlation_id: "experience-test" };
  return { dataRoot, missionRuntime, runtime, auth };
}

function companyInput() {
  return {
    name: "CYVX Cinematic Production Company",
    description: "A governed company runtime with a public production edge and a real operator control room.",
    target_customer: "Operators who need measurable autonomous execution",
    offer: "Install a governed mission-to-outcome operating capability.",
    price_cents: 250000,
    location: "United States",
    keywords: ["production", "governance", "growth"],
    outcome_contract: {
      objective: "Capture the first verified production pilot lead",
      target_metric: "lead_count",
      comparator: ">=",
      target_value: 1,
      target_unit: "count",
      max_budget_cents: 0,
      approval_threshold_cents: 0,
      risk_level: "medium",
    },
  };
}

async function request(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

test("cinematic public and control-room surfaces expose only connected production actions", () => {
  const publicHtml = renderPublicSite();
  assert.match(publicHtml, /Reality becomes/);
  assert.match(publicHtml, /\/api\/v1\/company-runtime\/public\/status/);
  assert.match(publicHtml, /\/api\/v1\/company-runtime\/public\/leads/);
  assert.match(publicHtml, /Start a production pilot/);
  assert.doesNotMatch(publicHtml, /PUBLIC DEMO MODE/);

  const controlHtml = renderControlRoom({ localToken: "local-test-token" });
  assert.match(controlHtml, /Operate the company/);
  assert.match(controlHtml, /Queue production task/);
  assert.match(controlHtml, /Record outcome and queue Growth/);
  assert.match(controlHtml, /Dispatch signed test event/);
  assert.match(controlHtml, /\/tasks/);
  assert.match(controlHtml, /\/outcomes/);
  assert.match(controlHtml, /\/dispatch/);
});

test("public lead validation rejects malformed input before persistence", () => {
  assert.deepEqual(normalizePublicLead({
    name: "Dakota",
    email: "DAKOTA@example.com",
    company: "CYVX",
    message: "Produce one measured outcome.",
  }), {
    name: "Dakota",
    email: "dakota@example.com",
    company: "CYVX",
    message: "Produce one measured outcome.",
    source: "cyvx-public-site",
    website: "",
  });
  assert.throws(() => normalizePublicLead({ name: "Dakota", email: "invalid", message: "Mission" }), /email must be valid/);
});

test("public production edge reports durable proof and writes pilot intake to the real lead ledger", async () => {
  const { missionRuntime, runtime, auth } = fixture();
  const token = "company-experience-test-token-that-is-long-enough";
  const server = createAutonomousCompanyHttpServer(runtime, { token, environment: "test" });
  const address = await server.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const created = runtime.createCompany(companyInput(), auth);
    runtime.approveCompany(created.team.company_id, { decision_reason: "Approve cinematic production proof" }, auth);
    await runtime.runToIdle(created.team.company_id, auth, 100);

    const publicPage = await request(base, "/");
    assert.equal(publicPage.response.status, 200);
    assert.match(publicPage.body, /CYVXAI-OS/);
    assert.match(publicPage.body, /Proof, not promises/);

    const controlRoom = await request(base, "/control-room");
    assert.equal(controlRoom.response.status, 200);
    assert.match(controlRoom.body, /Autonomous Company Control Room/);

    const status = await request(base, "/api/v1/company-runtime/public/status");
    assert.equal(status.response.status, 200);
    assert.equal(status.body.featured_company_id, created.team.company_id);
    assert.equal(status.body.metrics.companies, 1);
    assert.equal(status.body.metrics.tasks_completed, 9);
    assert.equal(status.body.metrics.proof_artifacts, 9);
    assert.equal(status.body.companies[0].model_provider, "rules");

    const lead = await request(base, "/api/v1/company-runtime/public/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        company_id: created.team.company_id,
        name: "Production Buyer",
        email: "buyer@example.com",
        company: "Buyer Operations",
        message: "We need a governed mission system with measurable revenue proof.",
        source: "experience-integration-test",
      }),
    });
    assert.equal(lead.response.status, 201);
    assert.equal(lead.body.company_id, created.team.company_id);
    assert.ok(lead.body.lead.id);

    const graph = runtime.getCompany(created.team.company_id, auth);
    assert.equal(graph.operator.company.counters.leads_count, 1);
    assert.equal(graph.operator.contract.status, "achieved");

    const snapshot = publicCompanySnapshot(runtime, auth);
    assert.equal(snapshot.metrics.leads, 1);
    assert.equal(snapshot.companies[0].contract_status, "achieved");
  } finally {
    await server.close();
    missionRuntime.close();
  }
});
