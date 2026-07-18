"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMissionRuntime } = require("../runtime/missions");
const { CompanyOperator } = require("../services/operator");
const { UniversalOperator } = require("../services/operator/universal");
const { VentureRevenueEngine } = require("../services/revenue/engine");
const { BidRevenueSprintOperator } = require("../services/revenue/bid-sprint");

class TestEmailProvider {
  configured() { return true; }
  snapshot() { return { configured: true, enabled: true, provider: "test", metrics: { delivered: 0 } }; }
  async send() { return { ok: true, provider: "test", id: "message-test" }; }
}

class TestStripeProvider {
  configured() { return true; }
  webhookConfigured() { return true; }
  snapshot() { return { configured: true, webhook_configured: true, enabled: true, metrics: { sessions_created: 0 } }; }
  async createCheckoutSession() { return { id: "cs_test", url: "https://checkout.example.test/cs_test", expires_at: new Date(Date.now() + 3600000).toISOString() }; }
  parseWebhook(rawBody) { return JSON.parse(rawBody); }
}

function fixture() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-bid-sprint-"));
  const intelligenceStatePath = path.join(dataRoot, "intelligence", "minnesota", "state.json");
  fs.mkdirSync(path.dirname(intelligenceStatePath), { recursive: true });
  fs.writeFileSync(intelligenceStatePath, JSON.stringify({
    generated_at: new Date().toISOString(),
    opportunities: [
      { id: "mn-clean-001", source: "official_state_portal", source_url: "https://example.test/opportunities/clean-001", title: "County custodial and janitorial services", agency: "Example County", location: "Minnesota", description: "Commercial cleaning for public facilities", score: 62, due_at: new Date(Date.now() + 21 * 86400000).toISOString() },
      { id: "mn-land-001", source: "official_city_portal", source_url: "https://example.test/opportunities/land-001", title: "Municipal grounds and landscaping maintenance", agency: "Example City", location: "Minnesota", description: "Seasonal grounds, lawn, and snow services", score: 58, due_at: new Date(Date.now() + 30 * 86400000).toISOString() },
      { id: "mn-unrelated-001", source: "official_state_portal", title: "Cloud hosting platform", agency: "Example Agency", location: "Minnesota", description: "Enterprise software hosting", score: 90 },
    ],
  }, null, 2));
  const runtime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  runtime.logger = runtime.logger || runtime.store.logger;
  const legacy = new CompanyOperator(runtime, { workspaceRoot: path.join(dataRoot, "companies"), intelligenceStatePath });
  const universal = new UniversalOperator(runtime, { legacy, universalWorkspaceRoot: path.join(dataRoot, "entities"), platformStatePath: path.join(dataRoot, "platform-state.json") });
  const revenue = new VentureRevenueEngine(runtime, {
    universal,
    email: new TestEmailProvider(),
    stripe: new TestStripeProvider(),
    workspaceRoot: path.join(dataRoot, "revenue"),
    publicBaseUrl: "https://cyvx.example.test",
    businessPostalAddress: "871 W 5th St, Winona, MN 55987",
  });
  const sprint = new BidRevenueSprintOperator(runtime, {
    universal,
    revenue,
    workspaceRoot: path.join(dataRoot, "bid-revenue-sprint"),
    intelligenceStatePath,
  });
  const auth = { user_id: "admin-local", organization_id: "default", role: "admin", correlation_id: "bid-sprint-test" };
  return { dataRoot, intelligenceStatePath, runtime, legacy, universal, revenue, sprint, auth };
}

function launch(f) {
  const built = f.sprint.bootstrap({}, f.auth);
  assert.equal(built.sprint.status, "awaiting_approval");
  return f.sprint.approveAndLaunch(built.sprint.id, { decision_reason: "Owner approved the bounded internal sprint activation for production verification." }, f.auth);
}

function addPaidClient(f, graph, index, amountCents) {
  const captured = f.revenue.captureInbound(graph.revenue.venture.slug, {
    name: `Buyer ${index}`,
    company_name: `Real Contractor ${index}`,
    email: `buyer${index}@example.com`,
    phone: `507-555-01${String(index).padStart(2, "0")}`,
    requested_outcome: "Win qualified commercial or public-sector service work with a compliant proposal system.",
    source: "sales_page",
  });
  f.revenue.advanceDeal(captured.deal_id, { stage: "proposal", probability: 0.7, next_action: "Owner review and payment." }, f.auth);
  return f.revenue.recordManualPayment(graph.sprint.venture_id, {
    deal_id: captured.deal_id,
    amount_cents: amountCents,
    receipt_reference: `business-bank-receipt-${index}`,
    evidence_note: `Owner verified the posted customer payment for contractor ${index} against the signed scope, invoice, and business bank receipt.`,
  }, f.auth);
}

test("bid sprint bootstrap creates the governed $5,000 operator and imports only relevant real opportunities", () => {
  const f = fixture();
  try {
    const built = f.sprint.bootstrap({}, f.auth);
    assert.equal(built.sprint.target_revenue_cents, 500000);
    assert.equal(built.sprint.target_recurring_mrr_cents, 50000);
    assert.equal(built.sprint.target_mix.reduce((sum, row) => sum + row.subtotal_cents, 0), 500000);
    assert.equal(built.revenue.metrics.revenue_cents, 0);
    assert.equal(fs.existsSync(path.join(built.sprint.workspace_path, "qualification-scorecard.md")), true);
    assert.equal(fs.existsSync(path.join(built.sprint.workspace_path, "proposal-production-sop.md")), true);
    assert.ok(built.tasks.some((task) => task.type === "owner.approve_activation" && task.requires_approval));

    const launched = f.sprint.approveAndLaunch(built.sprint.id, { decision_reason: "Owner approved bounded internal activation; external actions remain separately gated." }, f.auth);
    assert.equal(launched.sprint.status, "active");
    assert.equal(launched.revenue.venture.status, "active");
    assert.equal(launched.opportunities.length, 2);
    assert.ok(launched.opportunities.every((opportunity) => ["commercial_cleaning", "landscaping"].includes(opportunity.vertical)));
    assert.equal(launched.revenue.metrics.prospects, 0);
    assert.equal(launched.revenue.metrics.revenue_cents, 0);

    const opportunity = launched.opportunities[0];
    const qualified = f.sprint.decideOpportunity(launched.sprint.id, opportunity.id, { status: "qualified" }, f.auth);
    const submitTask = qualified.tasks.find((task) => task.type === "bid.submit" && task.related_id === opportunity.id);
    assert.ok(submitTask);
    assert.equal(submitTask.status, "awaiting_approval");
    f.sprint.decideTask(submitTask.id, { decision: "approved", evidence_note: "Owner reviewed the submission gate but no external submission has been represented as completed." }, f.auth);
    const afterApproval = f.sprint.getSprint(launched.sprint.id, f.auth);
    assert.equal(afterApproval.tasks.find((task) => task.id === submitTask.id).status, "approved");
    assert.equal(afterApproval.opportunities.find((item) => item.id === opportunity.id).status, "qualified");
  } finally { f.runtime.close(); }
});

test("three Proposal Sprints plus one Bid Readiness Pack reach verified $5,000 and convert accepted fulfillment to evidenced recurring MRR", () => {
  const f = fixture();
  try {
    let graph = launch(f);
    const payments = [150000, 150000, 150000, 50000].map((amount, index) => addPaidClient(f, graph, index + 1, amount));
    assert.equal(payments.length, 4);
    graph = f.sprint.getSprint(graph.sprint.id, f.auth);
    assert.equal(graph.revenue.metrics.revenue_cents, 500000);
    assert.equal(graph.revenue.metrics.owner_attested_revenue_cents, 500000);
    assert.equal(graph.revenue.metrics.clients, 4);
    assert.equal(graph.revenue.fulfillments.length, 4);

    for (const fulfillment of graph.revenue.fulfillments) {
      f.revenue.completeFulfillment(fulfillment.id, {
        evidence_note: "All contracted proposal-system deliverables were completed, reviewed with the real client, and accepted against the written scope and acceptance criteria.",
      }, f.auth);
    }
    let cycle = f.sprint.tick(graph.sprint.id, f.auth);
    assert.equal(cycle.constraint_code, "recurring_conversion");

    graph = f.sprint.getSprint(graph.sprint.id, f.auth);
    const client = graph.revenue.clients[0];
    const agreement = f.sprint.recordRecurringAgreement(graph.sprint.id, {
      client_id: client.id,
      deal_id: client.deal_id,
      monthly_cents: 50000,
      status: "active",
      agreement_reference: "signed-deal-desk-monitoring-001",
      evidence_note: "The client accepted the completed initial sprint and signed a $500 per month Deal Desk Monitoring scope beginning this month.",
    }, f.auth);
    assert.equal(agreement.recurring_mrr_cents, 50000);

    graph = f.sprint.getSprint(graph.sprint.id, f.auth);
    assert.equal(graph.sprint.status, "target_achieved");
    assert.equal(graph.sprint.verified_revenue_cents, 500000);
    assert.equal(graph.sprint.recurring_mrr_cents, 50000);
    assert.equal(graph.next_best_action.type, "growth.compound");
    assert.equal(graph.revenue.ledger.valid, true);
    assert.equal(f.runtime.evidence.verify(f.auth, { mission_id: graph.revenue.venture.mission_id }).valid, true);
  } finally { f.runtime.close(); }
});
