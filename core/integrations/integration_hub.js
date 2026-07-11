"use strict";

const { AuthorizationPolicy } = require("../security/authorization_policy");
const { EdgeGuard } = require("../security/edge_guard");
const { IdentityGateway } = require("../security/identity_gateway");
const { WorkloadIdentity } = require("../security/workload_identity");
const { truthy } = require("../security/production_guard");
const { AITrace } = require("../observability/ai_trace");
const { FeatureFlagService } = require("./feature_flags");
const { PostHogClient } = require("./posthog_client");
const { SentryTransport } = require("./sentry_transport");
const { StripeBilling } = require("./stripe_billing");
const { SupabaseDataClient } = require("./supabase_data_client");
const { QueueWorker, SupabaseQueueClient } = require("./supabase_queue");
const { TransactionalEmail } = require("./transactional_email");

class IntegrationHub {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.telemetry = options.telemetry || null;
    this.data = options.data || new SupabaseDataClient({ env: this.env, fetch: options.fetch });
    this.identity = options.identity || new IdentityGateway({ env: this.env, fetch: options.fetch });
    this.policy = options.policy || new AuthorizationPolicy({ requireMfaForPrivileged: truthy(this.env.CYVX_REQUIRE_MFA_FOR_PRIVILEGED ?? "true") });
    this.edge = options.edge || new EdgeGuard({ env: this.env });
    this.flags = options.flags || new FeatureFlagService({ env: this.env, dataClient: this.data });
    this.queue = options.queue || new SupabaseQueueClient({ env: this.env, dataClient: this.data });
    this.email = options.email || new TransactionalEmail({ env: this.env, fetch: options.fetch });
    this.analytics = options.analytics || new PostHogClient({ env: this.env, fetch: options.fetch });
    this.ai = options.ai || new AITrace({ env: this.env, fetch: options.fetch, telemetry: this.telemetry });
    this.sentry = options.sentry || new SentryTransport({ env: this.env, fetch: options.fetch });
    this.billing = options.billing || new StripeBilling({ env: this.env, dataClient: this.data, queue: this.queue });
    this.workloadIdentity = options.workloadIdentity || new WorkloadIdentity({ env: this.env, fetch: options.fetch });
    this.worker = options.worker || new QueueWorker({ queue: this.queue, telemetry: this.telemetry, enabled: truthy(this.env.CYVX_QUEUE_WORKER) });
    this.required = options.required ?? truthy(this.env.CYVX_REQUIRE_INTEGRATIONS);
    this.started = false;
    this.#registerHandlers();
  }

  assertConfiguration() {
    const snapshot = this.snapshot();
    const failed = snapshot.checks.filter((item) => item.required && !item.ok);
    if (failed.length) {
      const error = new Error(`CYVX integration configuration is incomplete: ${failed.map((item) => item.key).join(", ")}`);
      error.code = "CYVX_INTEGRATIONS_INVALID";
      error.details = snapshot;
      throw error;
    }
    return snapshot;
  }

  start() {
    this.flags.start();
    this.worker.start();
    this.started = true;
    return this.snapshot();
  }

  stop() {
    this.worker.stop();
    this.flags.stop();
    this.started = false;
    return this.snapshot();
  }

  async captureError(error, context = {}) {
    if (this.telemetry && typeof this.telemetry.captureError === "function") this.telemetry.captureError(error, context);
    return this.sentry.captureException(error, context);
  }

  async probe() {
    const data = await this.data.health();
    if (this.flags.configured()) await this.flags.refresh();
    return { ...this.snapshot(), live: { data } };
  }

  snapshot() {
    const requirements = integrationRequirements(this.env, this.required);
    const providers = {
      identity: this.identity.snapshot(),
      authorization: this.policy.snapshot(),
      edge: this.edge.snapshot(),
      data: this.data.snapshot(),
      queue: this.queue.snapshot(),
      queue_worker: this.worker.snapshot(),
      feature_flags: this.flags.snapshot(),
      ai_observability: this.ai.snapshot(),
      error_tracking: this.sentry.snapshot(),
      product_analytics: this.analytics.snapshot(),
      billing: this.billing.snapshot(),
      email: this.email.snapshot(),
      workload_identity: this.workloadIdentity.snapshot(),
    };
    const checks = [
      check("identity", !requirements.identity || providers.identity.configured, requirements.identity, providers.identity.verification),
      check("tenant_service_identity", !requirements.identity || providers.identity.service_tenant_configured, requirements.identity, providers.identity.service_tenant_configured ? "configured" : "missing"),
      check("edge", !requirements.edge || providers.edge.configured, requirements.edge, providers.edge.required ? "origin-secret" : "optional"),
      check("queue", !requirements.queue || providers.queue.configured, requirements.queue, providers.queue.queue_name),
      check("feature_flags", !requirements.feature_flags || providers.feature_flags.configured, requirements.feature_flags, providers.feature_flags.environment),
      check("ai_observability", !requirements.ai_observability || providers.ai_observability.configured, requirements.ai_observability, providers.ai_observability.endpoint || "unconfigured"),
      check("error_tracking", !requirements.error_tracking || providers.error_tracking.configured, requirements.error_tracking, providers.error_tracking.host || "unconfigured"),
      check("product_analytics", !requirements.product_analytics || providers.product_analytics.configured, requirements.product_analytics, providers.product_analytics.host || "unconfigured"),
      check("billing", !requirements.billing || providers.billing.configured, requirements.billing, providers.billing.enabled ? "enabled" : "disabled"),
      check("email", !requirements.email || providers.email.configured, requirements.email, providers.email.provider || "unconfigured"),
      check("workload_identity", !requirements.workload_identity || providers.workload_identity.exchange_configured, requirements.workload_identity, providers.workload_identity.exchange_host || "unconfigured"),
    ];
    return {
      version: "8.0.0-integration-baseline",
      required: this.required,
      started: this.started,
      ready: checks.every((item) => !item.required || item.ok),
      requirements,
      checks,
      providers,
    };
  }

  #registerHandlers() {
    this.worker
      .register("email.send", (payload) => this.email.send(payload))
      .register("billing.stripe", (payload) => this.billing.process(payload))
      .register("analytics.capture", (payload, context) => this.analytics.capture(payload.event, {
        distinctId: payload.distinct_id,
        tenantId: context.envelope.tenant_id,
        properties: payload.properties,
      }))
      .register("ai.score", (payload, context) => this.ai.score({ ...payload, tenant_id: context.envelope.tenant_id }))
      .register("feature_flags.refresh", () => this.flags.refresh())
      .register("housekeeping.integrations", async () => ({ flags: await this.flags.refresh(), snapshot: this.snapshot().ready }));
  }
}

function integrationRequirements(env, allRequired = false) {
  return {
    identity: allRequired || truthy(env.CYVX_REQUIRE_IDENTITY),
    edge: allRequired || truthy(env.CYVX_REQUIRE_EDGE),
    queue: allRequired || truthy(env.CYVX_REQUIRE_QUEUE),
    feature_flags: allRequired || truthy(env.CYVX_REQUIRE_FEATURE_FLAGS),
    ai_observability: allRequired || truthy(env.CYVX_REQUIRE_AI_OBSERVABILITY),
    error_tracking: allRequired || truthy(env.CYVX_REQUIRE_ERROR_TRACKING),
    product_analytics: truthy(env.CYVX_REQUIRE_PRODUCT_ANALYTICS),
    billing: truthy(env.CYVX_REQUIRE_BILLING),
    email: allRequired || truthy(env.CYVX_REQUIRE_EMAIL),
    workload_identity: truthy(env.CYVX_REQUIRE_WORKLOAD_IDENTITY),
  };
}

function check(key, ok, required, detail) { return { key, ok: Boolean(ok), required: Boolean(required), detail }; }

module.exports = { IntegrationHub, integrationRequirements };
