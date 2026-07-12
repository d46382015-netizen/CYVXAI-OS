"use strict";

const VENTURE_VERSION = 1;
const VENTURE_KEY = "production-audit-v1";

const OFFER = Object.freeze({
  name: "CYVX Production Systems Audit",
  audience: "small service businesses with disconnected lead, scheduling, follow-up, reporting, or operations workflows",
  problem: "Revenue and delivery work is lost when customer intake, follow-up, fulfillment, and proof live in disconnected tools or manual processes.",
  promise: "Identify the highest-value automation bottleneck and deliver an evidence-backed implementation plan with one bounded staging prototype.",
  price_anchor_usd: 1500,
  delivery_days: 5,
  deliverables: Object.freeze([
    "Current-state workflow map",
    "Constraint and failure-point analysis",
    "Prioritized automation opportunity scorecard",
    "One reversible staging prototype",
    "Implementation, measurement, security, and rollback plan"
  ]),
  call_to_action: "Request a production systems audit"
});

const POD_SPECS = Object.freeze([
  {
    key: "opportunity-validator",
    name: "Opportunity Validator",
    role: "validator",
    capabilities: ["problem_research", "buyer_interview_design", "demand_evidence"],
    permissions: { cloud_writes: true, deploy_staging: false, deploy_production: false, spend_budget: false }
  },
  {
    key: "venture-architect",
    name: "Venture Architect",
    role: "architect",
    capabilities: ["offer_design", "mission_planning", "acceptance_criteria"],
    permissions: { cloud_writes: true, deploy_staging: false, deploy_production: false, spend_budget: false }
  },
  {
    key: "asset-builder",
    name: "Asset Builder",
    role: "builder",
    capabilities: ["landing_asset", "lead_capture_contract", "staging_package"],
    permissions: { cloud_writes: true, deploy_staging: true, deploy_production: false, spend_budget: false }
  },
  {
    key: "qa-security",
    name: "QA and Security",
    role: "qa-security",
    capabilities: ["acceptance_testing", "security_review", "rollback_verification"],
    permissions: { cloud_writes: true, deploy_staging: false, deploy_production: false, spend_budget: false }
  },
  {
    key: "venture-operator",
    name: "Venture Operator",
    role: "operator",
    capabilities: ["measurement", "lead_triage", "outcome_reporting"],
    permissions: { cloud_writes: true, deploy_staging: false, deploy_production: false, spend_budget: false }
  }
]);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildVenturePlan(input = {}) {
  const organizationId = String(input.organizationId || "").trim();
  const parentAgentId = String(input.parentAgentId || "cyvx-parent-agent").trim();
  if (!organizationId) throw new TypeError("organizationId is required");
  if (!parentAgentId) throw new TypeError("parentAgentId is required");

  const missionId = input.missionId || `venture:${VENTURE_KEY}`;
  const agents = POD_SPECS.map((spec) => ({
    ...spec,
    id: `agent:${VENTURE_KEY}:${spec.key}`,
    organization_id: organizationId,
    parent_agent_id: parentAgentId,
    creation_mission_id: missionId,
    lineage_depth: 1,
    budget: { maximum_cost_usd: 0 },
    genome: {
      venture: VENTURE_KEY,
      version: VENTURE_VERSION,
      objective: OFFER.promise,
      termination_condition: "retire when the venture is terminated or the capability is superseded"
    }
  }));

  return {
    venture_key: VENTURE_KEY,
    version: VENTURE_VERSION,
    organization_id: organizationId,
    mission_id: missionId,
    parent_agent_id: parentAgentId,
    offer: OFFER,
    pod: agents,
    risk_tier: 1,
    stage: "staging_validation",
    expected_outputs: [
      "governed five-agent venture pod",
      "staging offer asset",
      "lead-capture data contract",
      "measurement plan",
      "Supervisor and Boss approval evidence"
    ],
    acceptance_tests: [
      "all child agents created through create_agent grants",
      "no pod agent has production-deploy or spend authority",
      "offer claims are bounded and evidence-oriented",
      "staging asset contains price, deliverables, CTA, privacy notice, and measurement hooks",
      "Supervisor approval and Boss authorization are independent",
      "deployment is reversible and zero-cost",
      "production gate remains closed without real demand evidence"
    ],
    production_gate: {
      minimum_buyer_interviews: 3,
      minimum_qualified_leads: 1,
      minimum_explicit_paid_intent: 1,
      require_staging_health: true,
      require_zero_critical_security_findings: true
    }
  };
}

function buildLandingPage(plan, options = {}) {
  if (!plan || !plan.offer) throw new TypeError("A venture plan is required");
  const contact = String(options.contact || "pbgkota93@gmail.com").trim();
  const formAction = String(options.formAction || "/api/v1/leads").trim();
  const offer = plan.offer;
  const items = offer.deliverables.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(offer.name)}</title>
  <meta name="description" content="${escapeHtml(offer.promise)}">
</head>
<body>
  <main data-cyvx-venture="${escapeHtml(plan.venture_key)}" data-stage="staging_validation">
    <p>CYVX • Production systems</p>
    <h1>${escapeHtml(offer.name)}</h1>
    <p>${escapeHtml(offer.problem)}</p>
    <p><strong>${escapeHtml(offer.promise)}</strong></p>
    <section>
      <h2>What is included</h2>
      <ul>${items}</ul>
    </section>
    <section>
      <h2>Scope</h2>
      <p>Designed for ${escapeHtml(offer.audience)}.</p>
      <p>Delivery target: ${offer.delivery_days} business days. Starting price: $${offer.price_anchor_usd.toLocaleString("en-US")}.</p>
    </section>
    <form method="post" action="${escapeHtml(formAction)}" data-measure="audit-interest">
      <input type="hidden" name="venture_key" value="${escapeHtml(plan.venture_key)}">
      <label>Name <input name="name" autocomplete="name" required maxlength="160"></label>
      <label>Email <input type="email" name="email" autocomplete="email" required maxlength="320"></label>
      <label>Business <input name="business" maxlength="200"></label>
      <label>Biggest workflow problem <textarea name="problem" required maxlength="3000"></textarea></label>
      <button type="submit">${escapeHtml(offer.call_to_action)}</button>
    </form>
    <p>Contact: <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a></p>
    <small>Staging validation only. No outcome, savings, revenue, legal compliance, or security result is guaranteed. Submitted information is used to evaluate and respond to the audit request.</small>
  </main>
</body>
</html>`;
}

function evaluateProductionGate(input = {}) {
  const gate = input.gate || {
    minimum_buyer_interviews: 3,
    minimum_qualified_leads: 1,
    minimum_explicit_paid_intent: 1,
    require_staging_health: true,
    require_zero_critical_security_findings: true
  };
  const metrics = {
    buyer_interviews: Math.max(0, Number(input.buyer_interviews || 0)),
    qualified_leads: Math.max(0, Number(input.qualified_leads || 0)),
    explicit_paid_intent: Math.max(0, Number(input.explicit_paid_intent || 0)),
    staging_healthy: input.staging_healthy === true,
    critical_security_findings: Math.max(0, Number(input.critical_security_findings || 0))
  };
  const checks = {
    buyer_interviews: metrics.buyer_interviews >= gate.minimum_buyer_interviews,
    qualified_leads: metrics.qualified_leads >= gate.minimum_qualified_leads,
    explicit_paid_intent: metrics.explicit_paid_intent >= gate.minimum_explicit_paid_intent,
    staging_health: !gate.require_staging_health || metrics.staging_healthy,
    security: !gate.require_zero_critical_security_findings || metrics.critical_security_findings === 0
  };
  return {
    eligible: Object.values(checks).every(Boolean),
    metrics,
    checks,
    decision: Object.values(checks).every(Boolean) ? "eligible_for_production_review" : "remain_in_staging_validation"
  };
}

module.exports = {
  VENTURE_VERSION,
  VENTURE_KEY,
  OFFER,
  POD_SPECS,
  escapeHtml,
  buildVenturePlan,
  buildLandingPage,
  evaluateProductionGate
};
