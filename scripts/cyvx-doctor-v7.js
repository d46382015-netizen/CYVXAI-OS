"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { inspectProductionSecurity, isProduction, truthy } = require("../core/security/production_guard");
const { IntegrationHub } = require("../core/integrations/integration_hub");

const ROOT = path.join(__dirname, "..");
const REQUIRED_FILES = [
  "api/runtime-v7.js",
  "api/public.js",
  "api/production.js",
  "api/integrated-production.js",
  "api/integration_routes.js",
  "spark/runtime.js",
  "spark/server.js",
  "core/production/autonomy_supervisor.js",
  "core/production/backup_manager.js",
  "core/production/backup_scheduler.js",
  "core/observability/telemetry.js",
  "core/observability/ai_trace.js",
  "core/security/production_guard.js",
  "core/security/identity_gateway.js",
  "core/security/authorization_policy.js",
  "core/security/edge_guard.js",
  "core/security/workload_identity.js",
  "core/integrations/integration_hub.js",
  "core/integrations/supabase_data_client.js",
  "core/integrations/supabase_queue.js",
  "core/integrations/feature_flags.js",
  "core/integrations/stripe_billing.js",
  "core/integrations/transactional_email.js",
  "core/integrations/posthog_client.js",
  "core/integrations/sentry_transport.js",
  "core/storage/managed_data_plane.js",
  "core/ops/overview.js",
  "core/ops/http_server.js",
  "spark/ui/app.js",
  "spark/ui/spark-client.js",
  "spark/ui/spark-render.js",
  "ops/postgres/001_production_baseline.sql",
  "ops/postgres/002_integrations.sql",
  "ops/prometheus/alerts.yml",
  "ops/otel/collector.yaml",
  "ops/cloudflare/cyvx-edge-policy.json",
  "render.yaml",
];

function inspect(env = process.env) {
  const dataRoot = path.resolve(env.CYVX_DATA_ROOT || path.join(os.homedir(), ".cyvx"));
  const checks = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push(check("node_version", major >= 22, process.version, ">=22 required"));
  for (const file of REQUIRED_FILES) checks.push(check(`file:${file}`, fs.existsSync(path.join(ROOT, file)), "present", "missing"));
  checks.push(writable("data_root", dataRoot));
  checks.push(writable("world_artifacts", env.SPARK_ARTIFACT_ROOT || path.join(dataRoot, "worlds")));
  checks.push(writable("runtime_logs", path.dirname(env.CYVX_LOG_PATH || path.join(dataRoot, "logs", "cyvx-runtime.jsonl"))));
  checks.push(check("public_port", validPort(env.PORT || env.CYVX_PUBLIC_PORT || 3000), env.PORT || env.CYVX_PUBLIC_PORT || 3000, "invalid port"));
  checks.push(check("integration_gateway_port", validPort(env.CYVX_GATEWAY_INTERNAL_PORT || 3001), env.CYVX_GATEWAY_INTERNAL_PORT || 3001, "invalid integration gateway port"));
  checks.push(check("legacy_gateway_port", validPort(env.CYVX_LEGACY_GATEWAY_INTERNAL_PORT || 3102), env.CYVX_LEGACY_GATEWAY_INTERNAL_PORT || 3102, "invalid legacy gateway port"));
  checks.push(check("autonomy", String(env.CYVX_AUTONOMY || "1") !== "0", env.CYVX_AUTONOMY || "1", "disabled", false));

  const security = inspectProductionSecurity(env);
  checks.push(check(
    "production_security",
    security.ok,
    security.ok ? "valid" : security.failed.join(","),
    "production and required integrations must fail closed when secrets or managed services are missing",
    isProduction(env) || truthy(env.CYVX_REQUIRE_MANAGED_DATA) || truthy(env.CYVX_BACKUP_ENABLED) || truthy(env.CYVX_REQUIRE_INTEGRATIONS),
  ));

  const hub = new IntegrationHub({ env });
  const integrations = hub.snapshot();
  checks.push(check(
    "integration_hub",
    integrations.ready,
    integrations.ready ? "ready" : integrations.checks.filter((item) => item.required && !item.ok).map((item) => item.key).join(",") || "optional",
    "configure every provider marked as required",
    integrations.required || integrations.checks.some((item) => item.required),
  ));

  checks.push(check("github_app", githubConfigured(env), githubConfigured(env) ? "configured" : "optional", "configure for repository operations", truthy(env.CYVX_REQUIRE_GITHUB_APP)));
  checks.push(check("hosted_telemetry", Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT), env.OTEL_EXPORTER_OTLP_ENDPOINT ? "configured" : "optional", "configure OTLP export for hosted traces and logs", false));
  checks.push(check("incident_notifications", Boolean(env.CYVX_ERROR_WEBHOOK_URL || env.CYVX_INCIDENT_WEBHOOK_URL), env.CYVX_ERROR_WEBHOOK_URL || env.CYVX_INCIDENT_WEBHOOK_URL ? "configured" : "optional", "configure an incident webhook", false));

  const failed = checks.filter((item) => !item.ok && item.required);
  return {
    ok: failed.length === 0,
    version: "8.0.0",
    timestamp: new Date().toISOString(),
    environment: env.CYVX_ENV || env.NODE_ENV || "development",
    data_root: dataRoot,
    security,
    integrations,
    checks,
    failed: failed.map((item) => item.key),
  };
}

function writable(key, target) {
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.accessSync(target, fs.constants.W_OK);
    return check(key, true, target, "not writable");
  } catch (error) {
    return check(key, false, target, error.message);
  }
}

function validPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

function githubConfigured(env) {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_PRIVATE_KEY_PEM && env.GITHUB_WEBHOOK_SECRET && env.GITHUB_OAUTH_STATE_SECRET);
}

function check(key, ok, value, guidance, required = true) {
  return { key, ok: Boolean(ok), required: Boolean(required), value, guidance };
}

if (require.main === module) {
  const result = inspect();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

module.exports = { inspect };
