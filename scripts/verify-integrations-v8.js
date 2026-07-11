#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { inspectProductionSecurity } = require("../core/security/production_guard");

const ROOT = path.join(__dirname, "..");
const REQUIRED = [
  "api/integrated-production.js",
  "api/integration_routes.js",
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
  "core/observability/ai_trace.js",
  "ops/postgres/002_integrations.sql",
  "ops/cloudflare/cyvx-edge-policy.json",
  "scripts/provision-cloudflare-v8.js",
  "scripts/oidc-smoke-v8.js",
  ".github/workflows/cloudflare-edge.yml",
  ".github/workflows/workload-identity-smoke.yml",
  ".github/workflows/integration-smoke.yml",
  "docs/operations/INTEGRATION_BASELINE.md",
];

function verify() {
  const checks = [];
  for (const file of REQUIRED) checks.push(check(`file:${file}`, fs.existsSync(path.join(ROOT, file)), "required integration-baseline artifact"));

  const publicRuntime = read("api/public.js");
  const runtime = read("api/runtime-v7.js");
  const secureProduction = read("api/secure-production.js");
  checks.push(check("gateway:public_perimeter", publicRuntime.includes('require("./integrated-production")'), "public runtime must use the integration perimeter"));
  checks.push(check("gateway:direct_perimeter", secureProduction.includes('require("./integrated-production")'), "direct production entrypoint must use the integration perimeter"));
  checks.push(check("runtime:integration_hub", runtime.includes("integrations"), "runtime must expose integration readiness"));
  checks.push(check("runtime:flagged_autonomy", runtime.includes("flagProvider: integrations.flags"), "autonomy must receive the managed feature-flag provider"));

  const routes = read("api/integration_routes.js");
  for (const route of [
    "/api/webhooks/stripe",
    "/api/v1/integrations/status",
    "/api/v1/integrations/probe",
    "/api/v1/integrations/flags",
    "/api/v1/integrations/jobs",
    "/api/v1/integrations/email",
    "/api/v1/integrations/analytics",
    "/api/v1/integrations/ai/score",
    "/api/v1/integrations/entitlements",
  ]) checks.push(check(`route:${route}`, routes.includes(route), `${route} must be implemented`));

  const migration = read("ops/postgres/002_integrations.sql");
  for (const object of [
    "cyvx_tenants", "cyvx_tenant_memberships", "cyvx_feature_flags",
    "cyvx_webhook_events", "cyvx_subscriptions", "cyvx_entitlements",
    "cyvx_enqueue_job", "cyvx_claim_jobs", "cyvx_ack_job", "cyvx_fail_job",
    "ENABLE ROW LEVEL SECURITY", "cyvx_is_aal2", "cyvx_schedule_integrations",
  ]) checks.push(check(`postgres:${object}`, migration.includes(object), `${object} must exist in the integration migration`));

  const edge = JSON.parse(read("ops/cloudflare/cyvx-edge-policy.json") || "{}");
  const phases = edge.phases || {};
  checks.push(check("edge:waf", Array.isArray(phases.http_request_firewall_custom) && phases.http_request_firewall_custom.length >= 2, "Cloudflare custom WAF rules must exist"));
  checks.push(check("edge:rate_limits", Array.isArray(phases.http_ratelimit) && phases.http_ratelimit.length >= 4, "Cloudflare rate-limit rules must exist"));
  checks.push(check("edge:origin_secret", JSON.stringify(edge).includes("__CYVX_EDGE_ORIGIN_SECRET__"), "Cloudflare must inject the trusted origin secret"));

  const missing = inspectProductionSecurity({ NODE_ENV: "production", CYVX_REQUIRE_INTEGRATIONS: "true" });
  for (const key of [
    "CYVX_API_KEY", "CYVX_POSTGREST_URL", "CYVX_OIDC_ISSUER",
    "CYVX_SERVICE_TENANT_ID", "CYVX_EDGE_ORIGIN_SECRET", "CYVX_QUEUE_WORKER",
    "LANGFUSE_OTLP_ENDPOINT", "SENTRY_DSN", "CYVX_EMAIL_PROVIDER",
  ]) checks.push(check(`fail_closed:${key}`, !missing.ok && missing.failed.includes(key), `${key} must fail closed when the full integration baseline is required`));

  const packageJson = JSON.parse(read("package.json") || "{}");
  for (const script of ["verify:integrations", "cloudflare:plan", "cloudflare:apply", "oidc:smoke"]) {
    checks.push(check(`package:${script}`, Boolean(packageJson.scripts && packageJson.scripts[script]), `${script} npm command must exist`));
  }

  const failed = checks.filter((item) => !item.ok);
  const result = { ok: failed.length === 0, version: "8.0.0", timestamp: new Date().toISOString(), checks, failed: failed.map((item) => item.key) };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

function read(file) {
  try { return fs.readFileSync(path.join(ROOT, file), "utf8"); }
  catch { return ""; }
}

function check(key, ok, guidance) { return { key, ok: Boolean(ok), guidance }; }

if (require.main === module) verify();

module.exports = { REQUIRED, verify };
