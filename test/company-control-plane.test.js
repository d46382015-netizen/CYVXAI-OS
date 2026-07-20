"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMissionRuntime } = require("../runtime/missions");
const { CompanyOperator } = require("../services/operator");
const { UniversalOperator } = require("../services/operator/universal");
const { CompanyControlPlane, CYCLE_PHASES } = require("../services/operator/company-control-plane");

function fixture(options = {}) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-company-control-"));
  const runtime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  runtime.logger = runtime.logger || runtime.store.logger;
  const legacy = new CompanyOperator(runtime, {
    workspaceRoot: path.join(dataRoot, "companies"),
    intelligenceStatePath: path.join(dataRoot, "intelligence", "minnesota", "state.json"),
  });
  const operator = new UniversalOperator(runtime, {
    legacy,
    universalWorkspaceRoot: path.join(dataRoot, "entities"),
    platformStatePath: path.join(dataRoot, "platform-state.json"),
  });
  const auth = { user_id: "admin-local", organization_id: "default", role: "admin", correlation_id: "company-control-test" };
  const created = operator.createEntity({
    entity_type: "venture",
    name: "CYVX Control Plane Venture",
    description: "A real service venture operated through evidence, experiments, deployments, and revenue truth.",
    subject: "Minnesota service businesses",
    operating_system: "Install an evidence-backed bid and revenue operating system.",
    target_customer: "Minnesota service businesses",
    offer: "CYVX Bid & Revenue Sprint",
    price_cents: 150000,
    location: "Minnesota",
    resources: ["CYVX runtime", "owned repository", "operator approval"],
    constraints: ["zero unapproved spend", "no fake revenue"],
    stakeholders: ["owner", "customer"],
    channels: ["owned landing page", "permissioned CRM"],
    keywords: ["bids", "revenue", "automation"],
    visibility: "private",
    outcome_contract: {
      objective: "Produce one verified qualified lead",
      target_metric: "lead_count",
      comparator: ">=",
      target_value: 1,
      target_unit: "count",
      max_budget_cents: 5000,
      approval_threshold_cents: 1,
      risk_level: "medium",
    },
  }, auth);
  operator.approveEntity(created.entity.id, { decision_reason: "Approve control-plane verification" }, auth);
  const activated = operator.runToIdle(created.entity.id, auth, 50).entity;
  const control = new CompanyControlPlane(runtime, options);
  return { dataRoot, runtime, operator, control, auth, entity: activated.entity, activated };
}

test("company mission compilation and truth transitions require owned evidence", () => {
  const { runtime, control, auth, entity, activated } = fixture();
  try {
    const compiled = control.compileMission(entity.id, {
      success_conditions: ["one verified lead", "evidence chain remains valid"],
      failure_conditions: ["budget exceeded", "provider proof fails"],
    }, auth);
    assert.equal(compiled.contract.entity.id, entity.id);
    assert.equal(compiled.contract.authority.max_budget_cents, 5000);
    assert.match(compiled.digest, /^[a-f0-9]{64}$/);

    const initial = control.currentTruth(entity.id, auth);
    assert.equal(initial.to_state, "idea");
    assert.throws(() => control.transitionTruth(entity.id, {
      to_state: "researched", reason: "Research exists without evidence",
    }, auth), /Evidence is required/);

    const evidenceId = activated.evidence[0].id;
    const researched = control.transitionTruth(entity.id, {
      to_state: "researched", reason: "Owned activation evidence proves current reality", evidence_id: evidenceId,
    }, auth);
    assert.equal(researched.from_state, "idea");
    assert.equal(researched.to_state, "researched");
    assert.equal(control.verifyEvidence(entity.id, auth).valid, true);
  } finally {
    runtime.close();
  }
});

test("decisions and bounded experiments measure prediction error and economic outcome", () => {
  const { runtime, control, auth, entity, activated } = fixture();
  try {
    const evidenceId = activated.evidence[0].id;
    const decision = control.recordDecision(entity.id, {
      question: "Which offer should be tested first?",
      hypothesis: "A fixed-scope bid sprint will convert faster than hourly consulting.",
      alternatives: ["hourly consulting", "subscription only"],
      selected_option: "fixed-scope bid sprint",
      expected_outcome: "At least 10 percent qualified-lead conversion.",
      confidence: 0.7,
      evidence_ids: [evidenceId],
    }, auth);
    assert.equal(decision.status, "open");
    const resolved = control.resolveDecision(decision.id, {
      actual_outcome: "Observed 12 percent conversion.",
      expected_value: 10,
      actual_value: 12,
    }, auth);
    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.prediction_error, 2);

    const experiment = control.createExperiment(entity.id, {
      name: "Bid sprint conversion",
      hypothesis: "The fixed-scope offer reaches at least 10 percent conversion.",
      audience: "Qualified Minnesota service businesses",
      offer: "CYVX Bid & Revenue Sprint",
      channel: "permissioned landing page",
      metric_name: "conversion_rate",
      baseline: 4,
      target: 10,
      budget_ceiling_cents: 1000,
      sample_threshold: 20,
    }, auth);
    control.observeExperiment(experiment.id, {
      metric_value: 12, sample_count: 20, cost_cents: 600, evidence_id: evidenceId,
    }, auth);
    assert.throws(() => control.observeExperiment(experiment.id, {
      metric_value: 13, sample_count: 1, cost_cents: 500,
    }, auth), /budget ceiling/);
    const evaluated = control.evaluateExperiment(experiment.id, {}, auth);
    assert.equal(evaluated.status, "won");
    assert.equal(evaluated.result.sample_size, 20);
    assert.equal(evaluated.result.delta_from_baseline, 8);
  } finally {
    runtime.close();
  }
});

test("operating cycles, effects, and sagas enforce sequence, idempotency, and compensation", () => {
  const { runtime, control, auth, entity } = fixture();
  try {
    let cycle = control.startCycle(entity.id, {
      objective: "Prove one complete company operating cycle",
      baseline: { leads: 0 },
      plan: { target_leads: 1 },
    }, auth);
    assert.equal(cycle.phase, "observe");
    assert.throws(() => control.advanceCycle(cycle.id, { phase: "execute" }, auth), /Next phase must be diagnose/);
    for (const phase of CYCLE_PHASES.slice(1)) {
      cycle = control.advanceCycle(cycle.id, {
        phase,
        ...(phase === "verify" ? { result: { verified_leads: 1 } } : {}),
        ...(phase === "learn" ? { learning: { conclusion: "owned proof outperforms generated claims" } } : {}),
      }, auth);
    }
    assert.equal(cycle.phase, "completed");
    assert.ok(cycle.completed_at);

    const effect = control.reserveEffect(entity.id, {
      action_type: "offer.publish",
      idempotency_key: "offer:primary:v1",
      input: { slug: "bid-sprint" },
    }, auth);
    const duplicate = control.reserveEffect(entity.id, {
      action_type: "offer.publish",
      idempotency_key: "offer:primary:v1",
      input: { slug: "bid-sprint" },
    }, auth);
    assert.equal(duplicate.id, effect.id);
    assert.throws(() => control.reserveEffect(entity.id, {
      action_type: "offer.publish",
      idempotency_key: "offer:primary:v1",
      input: { slug: "different" },
    }, auth), /Idempotency key/);
    const settled = control.settleEffect(effect.id, { status: "completed", result: { url: "https://example.invalid/bid-sprint" } }, auth);
    assert.equal(settled.status, "completed");

    const saga = control.createSaga(entity.id, { name: "Offer deployment", context: { environment: "staging" } }, auth);
    control.addSagaStep(saga.id, {
      sequence: 1, action_type: "offer.publish", effect_id: effect.id,
      compensation_type: "deployment.rollback", status: "completed",
    }, auth);
    control.addSagaStep(saga.id, {
      sequence: 2, action_type: "lead.capture", status: "failed", error: "Provider unavailable",
    }, auth);
    const compensated = control.compensateSaga(saga.id, {}, auth);
    assert.equal(compensated.status, "compensated");
    assert.equal(compensated.compensated_steps, 1);
  } finally {
    runtime.close();
  }
});

test("providers, deployments, SLOs, usage, notifications, vertical packs, and snapshot are real", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({
    ok: true, service: "cyvx-company-control-plane", version: "abcdef1",
  }), { status: 200, headers: { "content-type": "application/json" } });
  const { runtime, control, auth, entity, activated } = fixture({ fetch: fakeFetch });
  try {
    process.env.CYVX_TEST_PROVIDER_TOKEN = "configured-for-test";
    const provider = control.upsertProvider({
      name: "render",
      environment: "staging",
      supported_actions: ["deployment.execute", "deployment.rollback"],
      required_secrets: ["CYVX_TEST_PROVIDER_TOKEN"],
      metadata: { account_scope: "test" },
    }, auth);
    assert.equal(provider.status, "ready");
    assert.deepEqual(provider.missing_secret_names, []);

    const deployment = control.recordDeployment(entity.id, {
      provider_id: provider.id,
      environment: "staging",
      commit_sha: "abcdef1234567890",
      base_url: "https://cyvx.example.test",
      health_url: "https://cyvx.example.test/healthz",
      expected_service: "cyvx-company-control-plane",
      status: "deployed",
    }, auth);
    const proof = await control.verifyDeployment(deployment.id, auth);
    assert.equal(proof.status, "proven");
    assert.equal(proof.http_status, 200);

    const evidenceId = activated.evidence[0].id;
    const usage = control.meterUsage(entity.id, {
      metric: "verified_actions", quantity: 1, unit: "action", source: "company-control-test", evidence_id: evidenceId,
    }, auth);
    assert.equal(usage.quantity, 1);

    const slo = control.defineSlo(entity.id, {
      name: "Deployment availability", metric: "availability", comparator: ">=", target: 99.9, window_seconds: 3600,
    }, auth);
    const breached = control.recordSloObservation(slo.id, { value: 90, evidence_id: evidenceId }, auth);
    assert.equal(breached.good, false);
    assert.ok(control.listNotifications(auth, entity.id).some((item) => item.type === "slo.breached"));

    const pack = control.installVerticalPack(entity.id, {
      name: "CYVX Bid & Revenue Sprint",
      version: "1.0.0",
      entity_types: ["venture"],
      intelligence_sources: ["Minnesota procurement registry"],
      offers: ["Proposal Sprint", "Bid Readiness Pack", "Deal Desk Monitoring"],
      workflows: ["qualify", "proposal", "payment verification", "fulfillment acceptance", "recurring conversion"],
      metrics: ["verified_revenue_cents", "qualified_opportunities", "recurring_revenue_cents"],
      policies: ["no unverified revenue", "approval required for bid submission"],
      verification_commands: ["npm run bid:sprint:verify", "npm run company:control:verify"],
    }, auth);
    assert.match(pack.manifest_sha256, /^[a-f0-9]{64}$/);

    const snapshot = control.snapshot(entity.id, auth);
    assert.equal(snapshot.evidence_verification.valid, true);
    assert.equal(snapshot.counts.deployments, 1);
    assert.equal(snapshot.counts.vertical_packs, 1);
    assert.ok(snapshot.next_actions.length >= 5);
    assert.ok(snapshot.usage.some((item) => item.metric === "verified_actions"));
  } finally {
    delete process.env.CYVX_TEST_PROVIDER_TOKEN;
    runtime.close();
  }
});
