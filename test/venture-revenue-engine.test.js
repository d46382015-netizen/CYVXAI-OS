"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMissionRuntime } = require("../runtime/missions");
const { CompanyOperator } = require("../services/operator");
const { UniversalOperator } = require("../services/operator/universal");
const { VentureRevenueEngine } = require("../services/revenue/engine");
const { StripeRevenueProvider } = require("../services/revenue/providers");
const { createUniversalOperatorRuntime, createUniversalOperatorHttpServer } = require("../services/operator/universal-server");

class TestEmailProvider {
  constructor(configured = true) { this.ready = configured; this.sent = []; }
  configured() { return this.ready; }
  snapshot() { return { configured: this.ready, enabled: this.ready, provider: "test", metrics: { delivered: this.sent.length } }; }
  async send(message) { if (!this.ready) throw Object.assign(new Error("not configured"), { code: "EMAIL_PROVIDER_UNCONFIGURED", status: 503 }); this.sent.push(message); return { ok: true, provider: "test", id: `message-${this.sent.length}` }; }
}

class TestStripeProvider {
  constructor() { this.sessions = []; this.events = []; }
  configured() { return true; }
  webhookConfigured() { return true; }
  snapshot() { return { configured: true, webhook_configured: true, enabled: true, metrics: { sessions_created: this.sessions.length } }; }
  async createCheckoutSession(input) { this.sessions.push(input); return { id: `cs_test_${this.sessions.length}`, url: `https://checkout.stripe.test/${this.sessions.length}`, payment_status: "unpaid", expires_at: new Date(Date.now() + 3600000).toISOString() }; }
  parseWebhook(rawBody) { const event = JSON.parse(rawBody); this.events.push(event); return event; }
}

function fixture(options = {}) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-revenue-engine-"));
  const runtime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  runtime.logger = runtime.logger || runtime.store.logger;
  const legacy = new CompanyOperator(runtime, {
    workspaceRoot: path.join(dataRoot, "companies"),
    intelligenceStatePath: path.join(dataRoot, "intelligence", "minnesota", "state.json"),
  });
  const universal = new UniversalOperator(runtime, {
    legacy,
    universalWorkspaceRoot: path.join(dataRoot, "entities"),
    platformStatePath: path.join(dataRoot, "platform-state.json"),
  });
  const email = options.email || new TestEmailProvider(true);
  const stripe = options.stripe || new TestStripeProvider();
  const revenue = new VentureRevenueEngine(runtime, {
    universal,
    email,
    stripe,
    workspaceRoot: path.join(dataRoot, "revenue"),
    publicBaseUrl: "https://ventures.example.test",
    businessPostalAddress: "123 Main Street, Winona, MN 55987",
  });
  const auth = { user_id: "admin-local", organization_id: "default", role: "admin", correlation_id: "revenue-test" };
  return { dataRoot, runtime, legacy, universal, revenue, email, stripe, auth };
}

function ventureInput(overrides = {}) {
  return {
    name: "CYVX Operations Recovery",
    market: "United States remote service businesses",
    ideal_customer: "Owner-operated service companies losing revenue through missed leads and disconnected fulfillment",
    problem: "Qualified demand is lost because intake, follow-up, payment, delivery, and proof are disconnected.",
    offer_name: "7-Day Revenue System Installation",
    offer_summary: "Install an owned customer-acquisition, payment, fulfillment, and evidence system tied to a measurable revenue outcome.",
    deliverables: ["Demand and offer audit", "Owned sales assets", "CRM and payment workflow", "Fulfillment evidence system"],
    price_cents: 150000,
    revenue_target_cents: 150000,
    max_budget_cents: 0,
    currency: "usd",
    booking_url: "https://calendar.example.test/cyvx",
    ...overrides,
  };
}

function activate(f) {
  const created = f.revenue.createVenture(ventureInput(), f.auth);
  const entityId = created.entity.entity.id;
  const ventureId = created.venture.venture.id;
  f.universal.approveEntity(entityId, { decision_reason: "Owner approved real venture activation" }, f.auth);
  const result = f.universal.runToIdle(entityId, f.auth, 40);
  assert.equal(result.entity.entity.activation_status, "learned");
  const launched = f.revenue.activate(ventureId, {}, f.auth);
  assert.equal(launched.venture.status, "active");
  return { entityId, ventureId, launched };
}

function inbound(f, slug) {
  return f.revenue.captureInbound(slug, {
    name: "Real Buyer",
    company_name: "Real Buyer Company",
    email: "buyer@example.com",
    phone: "507-555-0101",
    requested_outcome: "Recover at least $5,000 per month in missed service revenue within 30 days.",
    source: "sales_page",
  });
}

test("venture activation creates owned commercial assets with tamper-evident proof", () => {
  const f = fixture();
  try {
    const { ventureId, launched } = activate(f);
    assert.ok(launched.assets.length >= 10);
    const required = ["offer", "proposal", "discovery", "lead_magnet", "outreach", "fulfillment", "sales_page", "privacy", "terms"];
    for (const type of required) assert.ok(launched.assets.some((asset) => asset.type === type), `missing ${type}`);
    assert.equal(fs.existsSync(path.join(launched.venture.workspace_path, "public", "revenue.html")), true);
    assert.equal(fs.existsSync(path.join(launched.venture.workspace_path, "assets", "proposal-template.md")), true);
    assert.match(fs.readFileSync(path.join(launched.venture.workspace_path, "public", "revenue.html"), "utf8"), /A request never creates a fake customer or fake revenue/);
    assert.equal(launched.ledger.valid, true);
    assert.ok(launched.entity.evidence.length >= launched.assets.length);
    assert.equal(f.runtime.evidence.verify(f.auth, { mission_id: launched.venture.mission_id }).valid, true);
    assert.equal(f.revenue.verifyLedger(ventureId, f.auth).valid, true);
  } finally { f.runtime.close(); }
});

test("inbound demand becomes a real prospect and deal but not a client or revenue", () => {
  const f = fixture();
  try {
    const { ventureId, launched } = activate(f);
    const captured = inbound(f, launched.venture.slug);
    assert.ok(captured.lead_id);
    assert.ok(captured.deal_id);
    const graph = f.revenue.getVenture(ventureId, f.auth);
    assert.equal(graph.metrics.prospects, 1);
    assert.equal(graph.metrics.leads, 1);
    assert.equal(graph.metrics.clients, 0);
    assert.equal(graph.metrics.revenue_cents, 0);
    assert.equal(graph.deals[0].stage, "lead");
    assert.equal(graph.prospects[0].contact_basis, "opt_in");
    const legacyCompany = f.legacy.getCompany(graph.entity.entity.id, f.auth);
    assert.equal(legacyCompany.company.counters.leads_count, 1);
    assert.equal(legacyCompany.company.counters.revenue_cents, 0);
  } finally { f.runtime.close(); }
});

test("campaign approval and consent boundaries permit only opt-in or existing relationships", async () => {
  const f = fixture();
  try {
    const { ventureId } = activate(f);
    const imported = f.revenue.importProspects(ventureId, {
      source: "authorized_import",
      records: [
        { company_name: "Opt In LLC", email: "optin@example.com", contact_basis: "opt_in", consent_status: "opted_in" },
        { company_name: "Existing Client LLC", email: "existing@example.com", contact_basis: "existing_relationship", consent_status: "active" },
        { company_name: "Public Listing LLC", email: "public@example.com", contact_basis: "public_business_contact", consent_status: "unknown" },
      ],
    }, f.auth);
    assert.equal(imported.imported, 3);
    const campaign = f.revenue.createCampaign(ventureId, {
      name: "Permissioned qualification",
      subject_template: "A measurable outcome for {{company_name}}",
      body_template: "Hi {{first_name}}, you asked to hear from {{venture_name}} about {{offer_name}}.",
      daily_limit: 10,
    }, f.auth);
    await assert.rejects(() => f.revenue.runCampaign(campaign.id, {}, f.auth), (error) => error.code === "CAMPAIGN_NOT_APPROVED");
    f.revenue.approveCampaign(campaign.id, f.auth);
    const result = await f.revenue.runCampaign(campaign.id, {}, f.auth);
    assert.equal(result.sent, 2);
    assert.equal(f.email.sent.length, 2);
    assert.ok(f.email.sent.every((message) => !message.to.includes("public@example.com")));
    assert.ok(f.email.sent.every((message) => message.text.includes("Unsubscribe:")));
    const graph = f.revenue.getVenture(ventureId, f.auth);
    assert.equal(graph.messages.filter((message) => message.status === "sent").length, 2);
  } finally { f.runtime.close(); }
});

test("Stripe checkout does not count revenue until a provider-verified paid webhook arrives", async () => {
  const f = fixture();
  try {
    const { ventureId, launched } = activate(f);
    const captured = inbound(f, launched.venture.slug);
    f.revenue.advanceDeal(captured.deal_id, { stage: "proposal", probability: 0.65 }, f.auth);
    const checkout = await f.revenue.createCheckout(ventureId, { deal_id: captured.deal_id }, f.auth);
    assert.match(checkout.url, /^https:\/\/checkout\.stripe\.test\//);
    let graph = f.revenue.getVenture(ventureId, f.auth);
    assert.equal(graph.metrics.revenue_cents, 0);
    assert.equal(graph.metrics.clients, 0);
    assert.equal(graph.payments[0].status, "pending");

    const paidEvent = {
      event_id: "evt_real_paid_1",
      type: "checkout.session.completed",
      livemode: true,
      created_at: new Date().toISOString(),
      checkout_session_id: checkout.checkout_session_id,
      payment_intent_id: "pi_real_1",
      payment_status: "paid",
      amount_total: 150000,
      currency: "usd",
      customer_email: "buyer@example.com",
      metadata: { venture_id: ventureId, deal_id: captured.deal_id, payment_id: checkout.payment_id },
    };
    const processed = f.revenue.processStripeWebhook(JSON.stringify(paidEvent), "ignored-by-test-provider");
    assert.equal(processed.status, "paid");
    assert.ok(processed.client_id);
    assert.ok(processed.evidence_id);
    const duplicate = f.revenue.processStripeWebhook(JSON.stringify(paidEvent), "ignored-by-test-provider");
    assert.equal(duplicate.duplicate, true);

    graph = f.revenue.getVenture(ventureId, f.auth);
    assert.equal(graph.metrics.provider_verified_revenue_cents, 150000);
    assert.equal(graph.metrics.revenue_cents, 150000);
    assert.equal(graph.metrics.clients, 1);
    assert.equal(graph.deals[0].stage, "won");
    assert.equal(graph.fulfillments.length, 1);
    assert.equal(graph.payments.filter((payment) => payment.status === "paid").length, 1);
    assert.equal(graph.ledger.valid, true);
    const legacyCompany = f.legacy.getCompany(graph.entity.entity.id, f.auth);
    assert.equal(legacyCompany.company.counters.revenue_cents, 150000);
  } finally { f.runtime.close(); }
});

test("manual revenue requires receipt evidence and fulfillment completion records proof", () => {
  const f = fixture();
  try {
    const { ventureId, launched } = activate(f);
    const captured = inbound(f, launched.venture.slug);
    assert.throws(() => f.revenue.recordManualPayment(ventureId, {
      deal_id: captured.deal_id,
      amount_cents: 150000,
      receipt_reference: "invoice-001",
      evidence_note: "too short",
    }, f.auth), (error) => error.code === "VALIDATION_ERROR");
    const payment = f.revenue.recordManualPayment(ventureId, {
      deal_id: captured.deal_id,
      amount_cents: 150000,
      receipt_reference: "bank-deposit-invoice-001",
      evidence_note: "Owner verified the posted customer deposit against invoice 001 and the business bank receipt.",
    }, f.auth);
    assert.equal(payment.verification, "owner_attested");
    let graph = f.revenue.getVenture(ventureId, f.auth);
    assert.equal(graph.metrics.owner_attested_revenue_cents, 150000);
    assert.equal(graph.metrics.clients, 1);
    const fulfillment = graph.fulfillments[0];
    const completed = f.revenue.completeFulfillment(fulfillment.id, {
      evidence_note: "All contracted assets were delivered, reviewed with the client, and accepted against the written acceptance criteria.",
    }, f.auth);
    assert.ok(completed.evidence_id);
    graph = f.revenue.getVenture(ventureId, f.auth);
    assert.equal(graph.fulfillments[0].status, "completed");
    assert.equal(graph.clients[0].status, "completed");
  } finally { f.runtime.close(); }
});

test("real Stripe provider creates checkout requests and verifies signed webhooks", async () => {
  const requests = [];
  const secret = "whsec_real_test";
  const provider = new StripeRevenueProvider({
    env: {},
    enabled: true,
    secretKey: "sk_test_real",
    webhookSecret: secret,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ id: "cs_123", url: "https://checkout.stripe.com/c/pay/cs_123", payment_status: "unpaid", expires_at: Math.floor(Date.now() / 1000) + 3600 }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const session = await provider.createCheckoutSession({
    amount_cents: 150000,
    currency: "usd",
    product_name: "Production system",
    description: "A real outcome",
    customer_email: "buyer@example.com",
    success_url: "https://example.com/success",
    cancel_url: "https://example.com/cancel",
    idempotency_key: "checkout-1",
    metadata: { venture_id: "venture-1", deal_id: "deal-1" },
  });
  assert.equal(session.id, "cs_123");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.stripe.com/v1/checkout/sessions");
  assert.match(requests[0].options.body, /metadata%5Bventure_id%5D=venture-1/);
  const event = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_123", payment_status: "paid", amount_total: 150000, currency: "usd", metadata: { venture_id: "venture-1", deal_id: "deal-1" } } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${event}`).digest("hex");
  const parsed = provider.parseWebhook(event, `t=${timestamp},v1=${signature}`);
  assert.equal(parsed.event_id, "evt_1");
  assert.equal(parsed.payment_status, "paid");
  assert.equal(parsed.amount_total, 150000);
});

test("HTTP runtime exposes revenue dashboard, public lead intake, CRM, and fail-closed checkout", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-revenue-http-"));
  const runtime = createMissionRuntime({ dataRoot, allowLocalAuth: true });
  runtime.logger = runtime.logger || runtime.store.logger;
  const email = new TestEmailProvider(false);
  const stripe = new TestStripeProvider();
  stripe.configured = () => false;
  stripe.snapshot = () => ({ configured: false, webhook_configured: false, enabled: false, metrics: {} });
  const operatorRuntime = createUniversalOperatorRuntime({
    runtime,
    email,
    stripe,
    universalWorkspaceRoot: path.join(dataRoot, "entities"),
    workspaceRoot: path.join(dataRoot, "companies"),
    platformStatePath: path.join(dataRoot, "platform-state.json"),
    publicBaseUrl: "https://ventures.example.test",
    businessPostalAddress: "123 Main Street, Winona, MN 55987",
  });
  const server = createUniversalOperatorHttpServer(operatorRuntime);
  const address = await server.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const tokenResponse = await fetch(`${base}/api/v1/operator/auth/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organization_id: "default", user_id: "admin-local" }) });
    const tokenPayload = await tokenResponse.json();
    const headers = { authorization: `Bearer ${tokenPayload.token}`, "content-type": "application/json" };
    const page = await fetch(`${base}/revenue`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Venture Revenue Engine/);

    const creation = await fetch(`${base}/api/v3/revenue/ventures`, { method: "POST", headers, body: JSON.stringify(ventureInput()) });
    assert.equal(creation.status, 201);
    const created = await creation.json();
    const entityId = created.result.entity.entity.id;
    const ventureId = created.result.venture.venture.id;
    await fetch(`${base}/api/v2/operator/entities/${entityId}/approve`, { method: "POST", headers, body: JSON.stringify({ decision_reason: "approved" }) });
    await fetch(`${base}/api/v2/operator/entities/${entityId}/run`, { method: "POST", headers, body: JSON.stringify({ maximum_ticks: 40 }) });
    const activation = await fetch(`${base}/api/v3/revenue/ventures/${ventureId}/activate`, { method: "POST", headers, body: "{}" });
    assert.equal(activation.status, 200);
    const activationPayload = await activation.json();
    const slug = activationPayload.revenue.venture.slug;
    assert.equal((await fetch(`${base}/v/${slug}`)).status, 200);

    const lead = await fetch(`${base}/api/v3/revenue/ventures/${slug}/leads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "HTTP Buyer", company_name: "HTTP Buyer LLC", email: "httpbuyer@example.com", requested_outcome: "Need a measurable production system." }) });
    assert.equal(lead.status, 201);
    const graphResponse = await fetch(`${base}/api/v3/revenue/ventures/${ventureId}`, { headers });
    const graph = await graphResponse.json();
    assert.equal(graph.revenue.metrics.leads, 1);
    assert.equal(graph.revenue.metrics.revenue_cents, 0);

    const checkout = await fetch(`${base}/api/v3/revenue/ventures/${slug}/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Buyer", company_name: "Buyer", email: "checkout@example.com", requested_outcome: "Need the system." }) });
    assert.equal(checkout.status, 503);
    const checkoutPayload = await checkout.json();
    assert.equal(checkoutPayload.error, "STRIPE_UNCONFIGURED");
  } finally {
    await server.close();
    runtime.close();
  }
});