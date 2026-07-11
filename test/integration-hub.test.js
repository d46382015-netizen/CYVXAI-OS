"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { IntegrationHub, integrationRequirements } = require("../core/integrations/integration_hub");

const TENANT = "11111111-1111-4111-8111-111111111111";

function configuredEnv() {
  return {
    NODE_ENV: "production",
    CYVX_ENV: "production",
    CYVX_REQUIRE_INTEGRATIONS: "true",
    CYVX_POSTGREST_URL: "https://project.example.test",
    CYVX_POSTGREST_SERVICE_KEY: "service-role-key-that-is-long-enough",
    CYVX_OIDC_ISSUER: "https://project.example.test/auth/v1",
    CYVX_OIDC_AUDIENCE: "authenticated",
    CYVX_OIDC_JWT_SECRET: "jwt-secret-that-is-at-least-thirty-two-characters",
    CYVX_SERVICE_TENANT_ID: TENANT,
    CYVX_REQUIRE_MFA_FOR_PRIVILEGED: "true",
    CYVX_EDGE_ORIGIN_SECRET: "edge-secret-that-is-at-least-thirty-two-characters",
    CYVX_QUEUE_WORKER: "true",
    LANGFUSE_OTLP_ENDPOINT: "https://langfuse.example.test/api/public/otel",
    LANGFUSE_OTLP_HEADERS: "Authorization=Basic test",
    SENTRY_DSN: "https://public-key@sentry.example.test/1",
    CYVX_EMAIL_PROVIDER: "resend",
    CYVX_EMAIL_FROM: "noreply@example.test",
    CYVX_EMAIL_ENABLED: "true",
    RESEND_API_KEY: "re_api_key_that_is_long_enough",
  };
}

test("integration requirement expansion keeps paid-launch providers independently gated", () => {
  const requirements = integrationRequirements({ CYVX_REQUIRE_INTEGRATIONS: "true" }, true);
  assert.equal(requirements.identity, true);
  assert.equal(requirements.edge, true);
  assert.equal(requirements.queue, true);
  assert.equal(requirements.feature_flags, true);
  assert.equal(requirements.ai_observability, true);
  assert.equal(requirements.error_tracking, true);
  assert.equal(requirements.email, true);
  assert.equal(requirements.product_analytics, false);
  assert.equal(requirements.billing, false);
});

test("integration hub fails closed when core provider contracts are missing", () => {
  const hub = new IntegrationHub({ env: { CYVX_REQUIRE_INTEGRATIONS: "true" }, fetch: async () => new Response("{}", { status: 200 }) });
  const snapshot = hub.snapshot();
  assert.equal(snapshot.ready, false);
  assert.throws(() => hub.assertConfiguration(), { code: "CYVX_INTEGRATIONS_INVALID" });
  for (const key of ["identity", "tenant_service_identity", "edge", "queue", "feature_flags", "ai_observability", "error_tracking", "email"]) {
    assert.ok(snapshot.checks.some((item) => item.key === key && item.required && !item.ok), `expected ${key} to be required and blocked`);
  }
});

test("integration hub becomes credential-ready without contacting providers", () => {
  const hub = new IntegrationHub({ env: configuredEnv(), fetch: async () => new Response("{}", { status: 200 }) });
  const snapshot = hub.assertConfiguration();
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.providers.identity.configured, true);
  assert.equal(snapshot.providers.edge.configured, true);
  assert.equal(snapshot.providers.queue.configured, true);
  assert.equal(snapshot.providers.feature_flags.configured, true);
  assert.equal(snapshot.providers.ai_observability.configured, true);
  assert.equal(snapshot.providers.error_tracking.configured, true);
  assert.equal(snapshot.providers.email.configured, true);
  assert.deepEqual(snapshot.providers.queue_worker.handlers, ["ai.score", "analytics.capture", "billing.stripe", "email.send", "feature_flags.refresh", "housekeeping.integrations"]);
});

test("integration hub starts and stops queue and flag schedulers", () => {
  const hub = new IntegrationHub({ env: { ...configuredEnv(), CYVX_QUEUE_POLL_MS: "999999", CYVX_FEATURE_FLAG_REFRESH_MS: "999999" }, fetch: async () => new Response("[]", { status: 200 }) });
  hub.start();
  const started = hub.snapshot();
  assert.equal(started.started, true);
  assert.equal(started.providers.queue_worker.scheduled, true);
  assert.equal(started.providers.feature_flags.scheduled, true);
  hub.stop();
  const stopped = hub.snapshot();
  assert.equal(stopped.started, false);
  assert.equal(stopped.providers.queue_worker.scheduled, false);
  assert.equal(stopped.providers.feature_flags.scheduled, false);
});
