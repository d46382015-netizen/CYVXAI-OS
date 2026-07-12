"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  VENTURE_KEY,
  buildVenturePlan,
  buildLandingPage,
  evaluateProductionGate,
  escapeHtml
} = require("../core/ventures/production-audit-venture");
const {
  PROJECT_REF,
  requireEnvironment,
  redact,
  writeEvidence
} = require("../scripts/activate-cyvx-production");

const ORG = "11111111-1111-4111-8111-111111111111";

test("first venture builds a bounded five-agent specialist pod", () => {
  const plan = buildVenturePlan({ organizationId: ORG, parentAgentId: "parent-agent" });
  assert.equal(plan.venture_key, VENTURE_KEY);
  assert.equal(plan.pod.length, 5);
  assert.equal(new Set(plan.pod.map((agent) => agent.id)).size, 5);
  assert.deepEqual(new Set(plan.pod.map((agent) => agent.role)), new Set([
    "validator", "architect", "builder", "qa-security", "operator"
  ]));
  for (const agent of plan.pod) {
    assert.equal(agent.organization_id, ORG);
    assert.equal(agent.parent_agent_id, "parent-agent");
    assert.equal(agent.creation_mission_id, plan.mission_id);
    assert.equal(agent.permissions.deploy_production, false);
    assert.equal(agent.permissions.spend_budget, false);
    assert.equal(agent.budget.maximum_cost_usd, 0);
  }
});

test("staging asset is complete, truthful, and escapes injected content", () => {
  const plan = buildVenturePlan({ organizationId: ORG });
  const page = buildLandingPage(plan, {
    contact: 'owner+<test>@example.com',
    formAction: '/lead?x=<script>alert(1)</script>'
  });
  assert.match(page, /CYVX Production Systems Audit/);
  assert.match(page, /Starting price: \$1,500/);
  assert.match(page, /Request a production systems audit/);
  assert.match(page, /No outcome, savings, revenue, legal compliance, or security result is guaranteed/);
  assert.doesNotMatch(page, /<script>alert\(1\)<\/script>/);
  assert.match(page, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(escapeHtml("<>&\"'"), "&lt;&gt;&amp;&quot;&#39;");
});

test("internal completion cannot unlock production without real demand evidence", () => {
  const plan = buildVenturePlan({ organizationId: ORG });
  const initial = evaluateProductionGate({
    gate: plan.production_gate,
    staging_healthy: true,
    critical_security_findings: 0
  });
  assert.equal(initial.eligible, false);
  assert.equal(initial.decision, "remain_in_staging_validation");
  assert.equal(initial.checks.staging_health, true);
  assert.equal(initial.checks.qualified_leads, false);
  assert.equal(initial.checks.explicit_paid_intent, false);
});

test("production review becomes eligible only after all evidence thresholds pass", () => {
  const plan = buildVenturePlan({ organizationId: ORG });
  const eligible = evaluateProductionGate({
    gate: plan.production_gate,
    buyer_interviews: 3,
    qualified_leads: 2,
    explicit_paid_intent: 1,
    staging_healthy: true,
    critical_security_findings: 0
  });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.decision, "eligible_for_production_review");

  const insecure = evaluateProductionGate({
    gate: plan.production_gate,
    buyer_interviews: 3,
    qualified_leads: 2,
    explicit_paid_intent: 1,
    staging_healthy: true,
    critical_security_findings: 1
  });
  assert.equal(insecure.eligible, false);
  assert.equal(insecure.checks.security, false);
});

test("activation requires every privileged production credential", () => {
  assert.equal(PROJECT_REF, "yokpfcbdvszdavohibkh");
  assert.throws(
    () => requireEnvironment({ SUPABASE_SECRET_KEY: "x" }, ["SUPABASE_SECRET_KEY", "CYVX_OWNER_EMAIL"]),
    (error) => error.code === "ACTIVATION_ENVIRONMENT_INCOMPLETE" && error.missing.includes("CYVX_OWNER_EMAIL")
  );
  assert.doesNotThrow(() => requireEnvironment({ A: "1", B: "2" }, ["A", "B"]));
});

test("activation evidence recursively redacts credentials and writes mode 0600", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-activation-"));
  const report = {
    ok: true,
    access_token: "sensitive",
    nested: { password: "sensitive", safe: "visible", items: [{ secret_key: "sensitive" }] }
  };
  const safe = redact(report);
  assert.equal(safe.access_token, "[redacted]");
  assert.equal(safe.nested.password, "[redacted]");
  assert.equal(safe.nested.safe, "visible");
  assert.equal(safe.nested.items[0].secret_key, "[redacted]");

  const target = writeEvidence(report, { CYVX_ACTIVATION_EVIDENCE_DIR: directory });
  const stored = JSON.parse(fs.readFileSync(target, "utf8"));
  assert.equal(stored.access_token, "[redacted]");
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
});
