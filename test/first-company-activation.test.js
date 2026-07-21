"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMissionRuntime } = require("../runtime/missions");
const { AutonomousCompanyRuntime, RulesModelProvider } = require("../services/company-runtime");
const {
  FIRST_COMPANY_NAME,
  FIRST_OUTCOME_SOURCE,
  activateFirstCompany,
  activationEnabled,
} = require("../services/company-runtime/bootstrap");

function fixture() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-first-company-"));
  const missionRuntime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  missionRuntime.logger = missionRuntime.logger || missionRuntime.store.logger;
  const companyRuntime = new AutonomousCompanyRuntime(missionRuntime, {
    companyWorkspaceRoot: path.join(dataRoot, "companies"),
    intelligenceStatePath: path.join(dataRoot, "intelligence", "state.json"),
    model: { provider: new RulesModelProvider() },
    leaseMs: 10000,
  });
  return { dataRoot, missionRuntime, companyRuntime, receiptPath: path.join(dataRoot, "proof", "first-company-activation.json") };
}

test("production and staging enable first-company activation unless explicitly disabled", () => {
  assert.equal(activationEnabled({}, { CYVX_ENV: "production" }), true);
  assert.equal(activationEnabled({}, { CYVX_ENV: "staging" }), true);
  assert.equal(activationEnabled({}, { CYVX_ENV: "development" }), false);
  assert.equal(activationEnabled({}, { CYVX_ENV: "production", CYVX_BOOTSTRAP_FIRST_COMPANY: "false" }), false);
  assert.equal(activationEnabled({ enabled: true }, { CYVX_ENV: "test" }), true);
});

test("first company is created, approved, run to idle, measured, learned, and resumed idempotently", async () => {
  const { dataRoot, missionRuntime, companyRuntime, receiptPath } = fixture();
  try {
    const first = await activateFirstCompany(companyRuntime, { receiptPath, maximumTicks: 100 });
    assert.equal(first.company_name, FIRST_COMPANY_NAME);
    assert.equal(first.created, true);
    assert.equal(first.approved, true);
    assert.equal(first.executed_to_idle, true);
    assert.equal(first.outcome_recorded, true);
    assert.equal(first.reused, false);
    assert.equal(first.completed_tasks, 9);
    assert.equal(first.proof_artifacts, 9);
    assert.equal(first.measured_outcome.metric_name, "governed_revenue_assets_completed");
    assert.equal(first.measured_outcome.value, 9);
    assert.equal(first.measured_outcome.source, FIRST_OUTCOME_SOURCE);
    assert.equal(first.verified_collected_revenue_cents, 0);
    assert.ok(first.next_improvement_task);
    assert.equal(fs.existsSync(receiptPath), true);

    const auth = { user_id: "test", organization_id: "default", role: "admin", correlation_id: "test" };
    const graph = companyRuntime.getCompany(first.company_id, auth);
    assert.equal(graph.operator.mission.status, "learned");
    assert.equal(graph.metrics.length, 1);
    assert.equal(graph.learnings.length, 1);
    assert.equal(graph.tasks.filter((task) => task.status === "completed").length, 9);
    assert.equal(graph.tasks.filter((task) => task.status === "pending" && task.role === "growth").length, 1);
    assert.equal(graph.team.status, "active");

    const second = await activateFirstCompany(companyRuntime, { receiptPath, maximumTicks: 100 });
    assert.equal(second.company_id, first.company_id);
    assert.equal(second.reused, true);
    assert.equal(second.created, false);
    assert.equal(second.approved, false);
    assert.equal(second.executed_to_idle, false);
    assert.equal(second.outcome_recorded, false);
    assert.equal(companyRuntime.listCompanies(auth).length, 1);
    const resumed = companyRuntime.getCompany(first.company_id, auth);
    assert.equal(resumed.metrics.filter((metric) => metric.source === FIRST_OUTCOME_SOURCE).length, 1);
    assert.equal(resumed.learnings.length, 1);

    const durableReceipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    assert.equal(durableReceipt.reused, true);
    assert.equal(durableReceipt.company_id, first.company_id);
    assert.match(durableReceipt.truth_boundary, /No customer, payment, or collected revenue is claimed/);
  } finally {
    missionRuntime.close();
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});
