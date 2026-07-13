"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMissionRuntime } = require("../runtime/missions");
const { CompanyOperator, normalizeContract } = require("../services/operator");
const { createCompanyOperatorRuntime, createCompanyOperatorHttpServer } = require("../services/operator/server");

function fixture() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-company-operator-"));
  const runtime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  runtime.logger = runtime.logger || runtime.store.logger;
  const operator = new CompanyOperator(runtime, {
    workspaceRoot: path.join(dataRoot, "companies"),
    intelligenceStatePath: path.join(dataRoot, "intelligence", "minnesota", "state.json"),
  });
  const auth = { user_id: "admin-local", organization_id: "default", role: "admin", correlation_id: "test-correlation" };
  return { dataRoot, runtime, operator, auth };
}

function companyInput(overrides = {}) {
  return {
    name: "CYVX Contract Operator",
    description: "Evidence-backed opportunity qualification and proposal infrastructure for service businesses.",
    target_customer: "Minnesota facilities and commercial service contractors",
    offer: "Install an owned system that finds, qualifies, and converts contract opportunities.",
    price_cents: 150000,
    location: "Minnesota",
    keywords: ["facilities", "janitorial", "landscaping", "proposal"],
    outcome_contract: {
      objective: "Generate one qualified lead without exceeding the approved budget",
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

async function jsonRequest(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json();
  return { response, payload };
}

test("operator activates a real owned company capability with evidence and learning", () => {
  const { runtime, operator, auth } = fixture();
  try {
    const created = operator.createCompany(companyInput(), auth);
    assert.equal(created.company.status, "awaiting_approval");
    assert.equal(created.mission.status, "awaiting_approval");
    assert.equal(created.actions.length, 6);
    assert.equal(created.progress.achieved, false);

    const approved = operator.approveCompany(created.company.id, { decision_reason: "Approved by owner" }, auth);
    assert.equal(approved.company.status, "active");
    assert.equal(approved.mission.status, "queued");

    const result = operator.runToIdle(created.company.id, auth, 20);
    const activated = result.company;
    assert.equal(activated.company.activation_status, "learned");
    assert.equal(activated.mission.status, "learned");
    assert.ok(activated.actions.every((action) => action.status === "completed"));
    assert.equal(activated.company.counters.spent_cents, 0);
    assert.ok(activated.evidence.length >= 6);

    const companyFile = path.join(activated.company.workspace_path, "company.json");
    const landingFile = path.join(activated.company.workspace_path, "public", "index.html");
    assert.equal(fs.existsSync(companyFile), true);
    assert.equal(fs.existsSync(landingFile), true);
    assert.match(fs.readFileSync(landingFile, "utf8"), /Start a conversation/);

    const verification = runtime.evidence.verify(auth, { mission_id: activated.mission.id });
    assert.equal(verification.valid, true);
    assert.equal(verification.artifacts_checked, activated.evidence.length);
  } finally {
    runtime.close();
  }
});

test("public lead capture persists the lead and achieves the outcome contract", () => {
  const { runtime, operator, auth } = fixture();
  try {
    const created = operator.createCompany(companyInput(), auth);
    operator.approveCompany(created.company.id, { decision_reason: "Approved" }, auth);
    operator.runToIdle(created.company.id, auth);

    const lead = operator.recordLead(created.company.id, {
      name: "Qualified Buyer",
      email: "buyer@example.com",
      company_name: "Buyer Company",
      message: "We need proposal infrastructure.",
      source: "operator-test",
    });
    assert.equal(lead.status, "new");

    const completed = operator.getCompany(created.company.id, auth);
    assert.equal(completed.company.counters.leads_count, 1);
    assert.equal(completed.contract.status, "achieved");
    assert.equal(completed.company.status, "completed");
    assert.equal(completed.progress.achieved, true);
    assert.equal(operator.listLeads(created.company.id, auth).length, 1);
  } finally {
    runtime.close();
  }
});

test("outcome contracts reject missing activation capabilities", () => {
  assert.throws(() => normalizeContract({
    objective: "Activate a company",
    target_metric: "lead_count",
    target_value: 1,
    max_budget_cents: 0,
    approval_threshold_cents: 0,
    allowed_capabilities: ["artifact.write"],
  }), (error) => error.code === "CONTRACT_CAPABILITY_GAP" && error.status === 422);
});

test("budget guard blocks work that would exceed the outcome contract", () => {
  const { runtime, operator, auth } = fixture();
  try {
    const input = companyInput({
      outcome_contract: {
        ...companyInput().outcome_contract,
        max_budget_cents: 100,
        approval_threshold_cents: 100,
      },
    });
    const created = operator.createCompany(input, auth);
    operator.approveCompany(created.company.id, { decision_reason: "Approved" }, auth);
    runtime.db.prepare("UPDATE operator_actions SET estimated_cost_cents=101 WHERE company_id=? AND sequence=1")
      .run(created.company.id);

    const tick = operator.runTick(created.company.id, auth);
    const blocked = operator.getCompany(created.company.id, auth);
    assert.equal(tick.status, "blocked");
    assert.match(tick.summary, /Budget guard/);
    assert.equal(blocked.company.status, "paused");
    assert.equal(blocked.actions[0].status, "blocked");
    assert.equal(blocked.company.counters.spent_cents, 0);
  } finally {
    runtime.close();
  }
});

test("action approval is enforced before a governed action executes", () => {
  const { runtime, operator, auth } = fixture();
  try {
    const created = operator.createCompany(companyInput(), auth);
    operator.approveCompany(created.company.id, { decision_reason: "Approved" }, auth);
    runtime.db.prepare("UPDATE operator_actions SET requires_approval=1 WHERE company_id=? AND sequence=1")
      .run(created.company.id);

    const blocked = operator.runTick(created.company.id, auth);
    assert.equal(blocked.status, "blocked");
    let graph = operator.getCompany(created.company.id, auth);
    assert.equal(graph.actions[0].status, "awaiting_approval");
    assert.equal(graph.approvals[0].status, "pending");

    operator.approveAction(graph.actions[0].id, { decision: "approved", decision_reason: "Owner approved action" }, auth);
    const executed = operator.runTick(created.company.id, auth);
    assert.equal(executed.status, "completed");
    graph = operator.getCompany(created.company.id, auth);
    assert.equal(graph.actions[0].status, "completed");
    assert.ok(graph.actions[0].evidence_id);
  } finally {
    runtime.close();
  }
});

test("HTTP runtime exposes authenticated company control and public lead intake", async () => {
  const { runtime } = fixture();
  const operatorRuntime = createCompanyOperatorRuntime({
    runtime,
    workspaceRoot: path.join(runtime.dataRoot, "companies-http"),
    intelligenceStatePath: path.join(runtime.dataRoot, "intelligence-http.json"),
  });
  const server = createCompanyOperatorHttpServer(operatorRuntime);
  const address = await server.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const authResponse = await jsonRequest(base, "/api/v1/operator/auth/token", {
      method: "POST",
      body: JSON.stringify({ organization_id: "default", user_id: "admin-local" }),
    });
    assert.equal(authResponse.response.status, 200);
    assert.ok(authResponse.payload.token);
    const headers = { authorization: `Bearer ${authResponse.payload.token}` };

    const creation = await jsonRequest(base, "/api/v1/operator/companies", {
      method: "POST", headers, body: JSON.stringify(companyInput()),
    });
    assert.equal(creation.response.status, 201);
    const companyId = creation.payload.operator.company.id;

    const approval = await jsonRequest(base, `/api/v1/operator/companies/${companyId}/approve`, {
      method: "POST", headers, body: JSON.stringify({ decision_reason: "Approved by HTTP test" }),
    });
    assert.equal(approval.response.status, 200);

    const execution = await jsonRequest(base, `/api/v1/operator/companies/${companyId}/run`, {
      method: "POST", headers, body: JSON.stringify({ maximum_ticks: 20 }),
    });
    assert.equal(execution.response.status, 200);
    assert.equal(execution.payload.result.company.mission.status, "learned");

    const page = await fetch(`${base}${execution.payload.result.company.company.public_path}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /OWNER-CONTROLLED/);

    const publicLead = await jsonRequest(base, `/api/v1/operator/companies/${companyId}/leads`, {
      method: "POST",
      body: JSON.stringify({ name: "Public Lead", email: "public@example.com", message: "Interested" }),
    });
    assert.equal(publicLead.response.status, 201);

    const graph = await jsonRequest(base, `/api/v1/operator/companies/${companyId}`, { headers });
    assert.equal(graph.response.status, 200);
    assert.equal(graph.payload.operator.company.counters.leads_count, 1);
    assert.equal(graph.payload.operator.contract.status, "achieved");
  } finally {
    await server.close();
    runtime.close();
  }
});