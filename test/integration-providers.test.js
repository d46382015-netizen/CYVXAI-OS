"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { AITrace, hashContent } = require("../core/observability/ai_trace");
const { FeatureFlagService } = require("../core/integrations/feature_flags");
const { PostHogClient, pseudonym, sanitizeProperties } = require("../core/integrations/posthog_client");
const { SentryTransport, parseDsn } = require("../core/integrations/sentry_transport");
const { StripeBilling, normalizeStripeEvent } = require("../core/integrations/stripe_billing");
const { SupabaseDataClient } = require("../core/integrations/supabase_data_client");
const { QueueWorker, normalizeJob } = require("../core/integrations/supabase_queue");
const { TransactionalEmail, normalizeMessage } = require("../core/integrations/transactional_email");

const TENANT = "11111111-1111-4111-8111-111111111111";

test("feature flags prefer tenant target and expose OpenFeature-compatible details", () => {
  const service = new FeatureFlagService({ env: { CYVX_ENV: "production" } });
  service.rows = [
    { flag_key: "autonomy.enabled", flag_type: "boolean", flag_value: true, enabled: true, tenant_id: null, environment: "production", updated_at: "2026-01-01T00:00:00Z" },
    { flag_key: "autonomy.enabled", flag_type: "boolean", flag_value: false, enabled: true, tenant_id: TENANT, environment: "production", updated_at: "2026-01-02T00:00:00Z" },
  ];
  assert.equal(service.getBooleanValue("autonomy.enabled", true, { tenantId: TENANT }), false);
  assert.equal(service.getBooleanValue("autonomy.enabled", false, { tenantId: "other" }), true);
  const detail = service.openFeatureProvider().resolveBooleanEvaluation("autonomy.enabled", true, { tenantId: TENANT });
  assert.equal(detail.value, false);
  assert.equal(detail.reason, "TARGETING_MATCH");
});

test("Supabase Data API preserves service authorization and Prefer headers", async () => {
  let captured;
  const client = new SupabaseDataClient({
    baseUrl: "https://project.example.test",
    serviceKey: "service-role-key-that-is-long-enough",
    fetch: async (url, options) => {
      captured = { url, options };
      return new Response("[]", { status: 201, headers: { "content-type": "application/json" } });
    },
  });
  await client.upsert("cyvx_feature_flags", { flag_key: "x" }, { onConflict: "flag_key,environment,tenant_id", returnRepresentation: true, headers: { "x-test": "yes" } });
  assert.equal(captured.options.headers.authorization, "Bearer service-role-key-that-is-long-enough");
  assert.equal(captured.options.headers.apikey, "service-role-key-that-is-long-enough");
  assert.match(captured.options.headers.Prefer, /resolution=merge-duplicates/);
  assert.equal(captured.options.headers["x-test"], "yes");
});

test("Stripe webhook signature verifies and subscription metadata becomes a tenant entitlement event", () => {
  const secret = "whsec_integration_test_secret_123456789";
  const body = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated", created: 1, data: { object: { id: "sub_1", customer: "cus_1", status: "active", current_period_end: 2000000000, metadata: { tenant_id: TENANT }, items: { data: [{ price: { id: "price_growth" } }] } } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const billing = new StripeBilling({ env: {}, webhookSecret: secret, pricePlans: { price_growth: "growth" } });
  assert.equal(billing.verify(body, `t=${timestamp},v1=${signature}`, timestamp), true);
  assert.throws(() => billing.verify(body, `t=${timestamp},v1=deadbeef`, timestamp), { code: "STRIPE_SIGNATURE_INVALID" });
  const normalized = normalizeStripeEvent(JSON.parse(body), { price_growth: "growth" });
  assert.equal(normalized.tenant_id, TENANT);
  assert.equal(normalized.subscription_id, "sub_1");
  assert.equal(normalized.plan_key, "growth");
});

test("PostHog client pseudonymizes identities and drops non-allowlisted content", () => {
  const salt = "analytics-salt-that-is-at-least-thirty-two-characters";
  assert.equal(pseudonym("user@example.com", salt), pseudonym("user@example.com", salt));
  assert.notEqual(pseudonym("user@example.com", salt), "user@example.com");
  const sanitized = sanitizeProperties({ source: "onboarding", duration_ms: 10, prompt: "secret", email: "user@example.com", arbitrary: "drop" });
  assert.deepEqual(sanitized, { source: "onboarding", duration_ms: 10 });
  const client = new PostHogClient({ env: {}, apiKey: "phc_key", salt, enabled: true, fetch: async () => new Response("{}", { status: 200 }) });
  assert.equal(client.configured(), true);
});

test("transactional email rejects header injection and normalizes safe messages", () => {
  const normalized = normalizeMessage({ to: "buyer@example.com", subject: "Welcome\r\nBcc: attacker@example.com", text: "Hello" }, { from: "CYVX <noreply@example.com>", replyTo: "support@example.com" });
  assert.equal(normalized.subject, "Welcome Bcc: attacker@example.com");
  assert.deepEqual(normalized.to, ["buyer@example.com"]);
  assert.equal(normalized.from, "CYVX <noreply@example.com>");
  assert.throws(() => normalizeMessage({ to: "invalid", subject: "Test", text: "Hello" }, { from: "noreply@example.com", replyTo: "" }), { code: "EMAIL_RECIPIENT_REQUIRED" });
  const email = new TransactionalEmail({ env: {}, provider: "resend", from: "noreply@example.com", resendKey: "re_test_key_that_is_long_enough", enabled: true, fetch: async () => new Response('{"id":"email_1"}', { status: 200 }) });
  assert.equal(email.configured(), true);
});

test("Sentry DSN parsing and AI trace default privacy preserve no prompt content", async () => {
  const dsn = parseDsn("https://public-key@sentry.example.test/42");
  assert.equal(dsn.projectId, "42");
  assert.match(dsn.envelopeUrl, /\/api\/42\/envelope\/$/);
  const sentry = new SentryTransport({ env: {}, dsn: "https://public-key@sentry.example.test/42", fetch: async () => new Response("", { status: 200 }) });
  assert.equal(sentry.configured(), true);

  const bodies = [];
  const ai = new AITrace({
    env: {},
    endpoint: "https://langfuse.example.test/api/public/otel",
    headers: "Authorization=Basic test",
    captureContent: false,
    fetch: async (_url, options) => { bodies.push(JSON.parse(options.body)); return new Response("", { status: 200 }); },
  });
  const generation = ai.startGeneration("answer", { tenant_id: TENANT, model: "model", prompt: "private prompt" });
  await generation.end({ output: "private answer", input_tokens: 5, output_tokens: 3 });
  const serialized = JSON.stringify(bodies);
  assert.equal(serialized.includes("private prompt"), false);
  assert.equal(serialized.includes("private answer"), false);
  assert.equal(serialized.includes(hashContent("private prompt")), true);
});

test("queue worker acknowledges success and dead-letters unknown handlers", async () => {
  const acknowledged = [];
  const failed = [];
  let batch = [normalizeJob({ msg_id: 1, read_ct: 1, message: { type: "known", payload: { value: 7 } } }), normalizeJob({ msg_id: 2, read_ct: 1, message: { type: "unknown", payload: {} } })];
  const queue = {
    configured: () => true,
    claim: async () => { const result = batch; batch = []; return result; },
    acknowledge: async (id) => acknowledged.push(id),
    fail: async (job, error, options) => failed.push({ id: job.job_id, code: error.code, terminal: options.terminal }),
  };
  const worker = new QueueWorker({ queue, enabled: true, intervalMs: 999999 });
  worker.register("known", async (payload) => assert.equal(payload.value, 7));
  await worker.tick();
  assert.deepEqual(acknowledged, [1]);
  assert.deepEqual(failed, [{ id: 2, code: "QUEUE_HANDLER_NOT_FOUND", terminal: true }]);
  assert.equal(worker.snapshot().metrics.succeeded, 1);
  assert.equal(worker.snapshot().metrics.dead_lettered, 1);
});
