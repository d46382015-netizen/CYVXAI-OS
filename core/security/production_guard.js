"use strict";

const crypto = require("node:crypto");

const PLACEHOLDER = /(replace[-_ ]?with|changeme|example\.com|your[-_ ]?project|placeholder|insert[-_ ]?here)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isProduction(env = process.env) {
  return String(env.NODE_ENV || env.CYVX_ENV || "").toLowerCase() === "production";
}

function inspectProductionSecurity(env = process.env) {
  const production = isProduction(env);
  const integrationsRequired = truthy(env.CYVX_REQUIRE_INTEGRATIONS);
  const identityRequired = integrationsRequired || truthy(env.CYVX_REQUIRE_IDENTITY);
  const edgeRequired = integrationsRequired || truthy(env.CYVX_REQUIRE_EDGE);
  const queueRequired = integrationsRequired || truthy(env.CYVX_REQUIRE_QUEUE);
  const flagsRequired = integrationsRequired || truthy(env.CYVX_REQUIRE_FEATURE_FLAGS);
  const aiRequired = integrationsRequired || truthy(env.CYVX_REQUIRE_AI_OBSERVABILITY);
  const errorsRequired = integrationsRequired || truthy(env.CYVX_REQUIRE_ERROR_TRACKING);
  const analyticsRequired = truthy(env.CYVX_REQUIRE_PRODUCT_ANALYTICS);
  const billingRequired = truthy(env.CYVX_REQUIRE_BILLING);
  const emailRequired = integrationsRequired || truthy(env.CYVX_REQUIRE_EMAIL);
  const workloadIdentityRequired = truthy(env.CYVX_REQUIRE_WORKLOAD_IDENTITY);
  const managedDataRequired = truthy(env.CYVX_REQUIRE_MANAGED_DATA) || queueRequired || flagsRequired || billingRequired;
  const backupsRequired = truthy(env.CYVX_BACKUP_ENABLED);
  const oidcIssuer = env.CYVX_OIDC_ISSUER || inferOidcIssuer(env);
  const oidcJwks = env.CYVX_OIDC_JWKS_URL || (oidcIssuer ? `${String(oidcIssuer).replace(/\/$/, "")}/.well-known/jwks.json` : "");
  const emailProvider = String(env.CYVX_EMAIL_PROVIDER || inferEmailProvider(env)).trim().toLowerCase();

  const checks = [
    secretCheck("CYVX_API_KEY", env.CYVX_API_KEY, 32, production),
    valueCheck("CYVX_OWNER_ID", env.CYVX_OWNER_ID, production),
    secretCheck("CYVX_OPERATOR_SESSION_SECRET", env.CYVX_OPERATOR_SESSION_SECRET, 32, production),
    urlCheck("APP_BASE_URL", env.APP_BASE_URL, production, { httpsOnly: production }),
    check("CYVX_ALLOW_INSECURE_LOCAL", !truthy(env.CYVX_ALLOW_INSECURE_LOCAL), String(env.CYVX_ALLOW_INSECURE_LOCAL || "false"), production, "must be false in production"),

    urlCheck("CYVX_POSTGREST_URL", env.CYVX_POSTGREST_URL || env.SUPABASE_URL, managedDataRequired, { httpsOnly: production }),
    secretCheck("CYVX_POSTGREST_SERVICE_KEY", env.CYVX_POSTGREST_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY, 24, managedDataRequired),

    secretCheck("CYVX_BACKUP_ENCRYPTION_KEY", env.CYVX_BACKUP_ENCRYPTION_KEY, 32, backupsRequired),
    urlCheck("CYVX_BACKUP_STORAGE_URL", backupStorageUrl(env), backupsRequired, { httpsOnly: production }),
    secretCheck("CYVX_BACKUP_STORAGE_TOKEN", backupStorageToken(env), 24, backupsRequired),
    valueCheck("CYVX_BACKUP_BUCKET", env.CYVX_BACKUP_BUCKET, backupsRequired),

    urlCheck("CYVX_OIDC_ISSUER", oidcIssuer, identityRequired, { httpsOnly: production }),
    valueCheck("CYVX_OIDC_AUDIENCE", env.CYVX_OIDC_AUDIENCE, identityRequired),
    alternativeCheck(
      "CYVX_OIDC_VERIFIER",
      [urlValid(oidcJwks, { httpsOnly: production }), strongSecret(env.CYVX_OIDC_JWT_SECRET, 32)],
      identityRequired,
      "configure an HTTPS JWKS URL or a 32+ character symmetric JWT secret",
    ),
    uuidCheck("CYVX_SERVICE_TENANT_ID", env.CYVX_SERVICE_TENANT_ID, identityRequired),
    check("CYVX_REQUIRE_MFA_FOR_PRIVILEGED", truthy(env.CYVX_REQUIRE_MFA_FOR_PRIVILEGED), String(env.CYVX_REQUIRE_MFA_FOR_PRIVILEGED || "false"), identityRequired, "must be true when identity is required"),

    secretCheck("CYVX_EDGE_ORIGIN_SECRET", env.CYVX_EDGE_ORIGIN_SECRET, 32, edgeRequired),
    valuePatternCheck("CYVX_EDGE_ORIGIN_HEADER", env.CYVX_EDGE_ORIGIN_HEADER || "x-cyvx-edge-secret", /^[a-z0-9-]{3,80}$/i, edgeRequired, "must be a valid HTTP header name"),

    valuePatternCheck("CYVX_QUEUE_NAME", env.CYVX_QUEUE_NAME || "cyvx_jobs", /^[a-z][a-z0-9_-]{2,62}$/, queueRequired, "must be a stable lowercase queue name"),
    check("CYVX_QUEUE_WORKER", truthy(env.CYVX_QUEUE_WORKER), String(env.CYVX_QUEUE_WORKER || "false"), queueRequired, "must be enabled when the durable queue is required"),
    valueCheck("CYVX_FEATURE_FLAG_ENVIRONMENT", env.CYVX_FEATURE_FLAG_ENVIRONMENT || env.CYVX_ENV || env.NODE_ENV, flagsRequired),

    urlCheck("LANGFUSE_OTLP_ENDPOINT", env.LANGFUSE_OTLP_ENDPOINT, aiRequired, { httpsOnly: production }),
    valueCheck("LANGFUSE_OTLP_HEADERS", env.LANGFUSE_OTLP_HEADERS, aiRequired),
    dsnCheck("SENTRY_DSN", env.SENTRY_DSN, errorsRequired),

    valueCheck("POSTHOG_API_KEY", env.POSTHOG_API_KEY, analyticsRequired),
    urlCheck("POSTHOG_HOST", env.POSTHOG_HOST || "https://us.i.posthog.com", analyticsRequired, { httpsOnly: production }),
    secretCheck("CYVX_ANALYTICS_SALT", env.CYVX_ANALYTICS_SALT, 32, analyticsRequired),

    secretCheck("CYVX_STRIPE_WEBHOOK_SECRET", env.CYVX_STRIPE_WEBHOOK_SECRET, 24, billingRequired),
    check("CYVX_BILLING_ENABLED", truthy(env.CYVX_BILLING_ENABLED), String(env.CYVX_BILLING_ENABLED || "false"), billingRequired, "must be enabled when billing is required"),

    choiceCheck("CYVX_EMAIL_PROVIDER", emailProvider, ["resend", "postmark"], emailRequired),
    emailCheck("CYVX_EMAIL_FROM", env.CYVX_EMAIL_FROM, emailRequired),
    alternativeCheck(
      "CYVX_EMAIL_CREDENTIAL",
      [emailProvider === "resend" && strongSecret(env.RESEND_API_KEY, 20), emailProvider === "postmark" && strongSecret(env.POSTMARK_SERVER_TOKEN, 20)],
      emailRequired,
      "configure the credential matching CYVX_EMAIL_PROVIDER",
    ),
    check("CYVX_EMAIL_ENABLED", truthy(env.CYVX_EMAIL_ENABLED), String(env.CYVX_EMAIL_ENABLED || "false"), emailRequired, "must be enabled when email is required"),

    urlCheck("CYVX_WORKLOAD_IDENTITY_EXCHANGE_URL", env.CYVX_WORKLOAD_IDENTITY_EXCHANGE_URL, workloadIdentityRequired, { httpsOnly: production }),
    valueCheck("CYVX_WORKLOAD_IDENTITY_AUDIENCE", env.CYVX_WORKLOAD_IDENTITY_AUDIENCE, workloadIdentityRequired),
  ];

  const failed = checks.filter((item) => item.required && !item.ok);
  return {
    ok: failed.length === 0,
    production,
    managed_data_required: managedDataRequired,
    backups_required: backupsRequired,
    integrations_required: integrationsRequired,
    integration_requirements: {
      identity: identityRequired,
      edge: edgeRequired,
      queue: queueRequired,
      feature_flags: flagsRequired,
      ai_observability: aiRequired,
      error_tracking: errorsRequired,
      product_analytics: analyticsRequired,
      billing: billingRequired,
      email: emailRequired,
      workload_identity: workloadIdentityRequired,
    },
    checks,
    failed: failed.map((item) => item.key),
  };
}

function assertProductionSecurity(env = process.env) {
  const result = inspectProductionSecurity(env);
  if (!result.ok) {
    const error = new Error(`CYVX production security configuration is invalid: ${result.failed.join(", ")}`);
    error.code = "CYVX_PRODUCTION_SECURITY_INVALID";
    error.details = result;
    throw error;
  }
  return result;
}

function authorizeRequest(req, env = process.env) {
  const expected = String(env.CYVX_API_KEY || "").trim();
  if (!expected) return !isProduction(env) && truthy(env.CYVX_ALLOW_INSECURE_LOCAL);
  const provided = extractCredential(req);
  return safeEqual(provided, expected);
}

function extractCredential(req) {
  const headers = req && req.headers || {};
  const raw = headers["x-api-key"] || headers.authorization || "";
  return String(raw).replace(/^Bearer\s+/i, "").trim();
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function secretCheck(key, value, minLength, required) {
  const text = String(value || "").trim();
  return check(key, strongSecret(text, minLength), text ? `configured:${text.length}` : "missing", required, `must be a non-placeholder secret of at least ${minLength} characters`);
}

function valueCheck(key, value, required) {
  const text = String(value || "").trim();
  return check(key, Boolean(text) && !PLACEHOLDER.test(text), text ? "configured" : "missing", required, "must be configured with a non-placeholder value");
}

function valuePatternCheck(key, value, pattern, required, guidance) {
  const text = String(value || "").trim();
  return check(key, pattern.test(text) && !PLACEHOLDER.test(text), text || "missing", required, guidance);
}

function choiceCheck(key, value, choices, required) {
  const text = String(value || "").trim().toLowerCase();
  return check(key, choices.includes(text), text || "missing", required, `must be one of: ${choices.join(", ")}`);
}

function uuidCheck(key, value, required) {
  const text = String(value || "").trim();
  return check(key, UUID.test(text), text ? "configured" : "missing", required, "must be an explicit UUID tenant identifier");
}

function emailCheck(key, value, required) {
  const text = String(value || "").replace(/[\r\n]+/g, " ").trim();
  const match = text.match(/<([^>]+)>/);
  const email = (match ? match[1] : text).trim();
  return check(key, /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) && !PLACEHOLDER.test(email), text || "missing", required, "must contain a valid non-placeholder sender email address");
}

function dsnCheck(key, value, required) {
  const text = String(value || "").trim();
  let ok = false;
  try {
    const parsed = new URL(text);
    ok = parsed.protocol === "https:" && Boolean(parsed.username) && parsed.pathname.split("/").filter(Boolean).length > 0 && !PLACEHOLDER.test(parsed.hostname);
  } catch {
    ok = false;
  }
  return check(key, ok, text ? "configured" : "missing", required, "must be a valid HTTPS Sentry DSN");
}

function alternativeCheck(key, alternatives, required, guidance) {
  return check(key, alternatives.some(Boolean), alternatives.some(Boolean) ? "configured" : "missing", required, guidance);
}

function urlCheck(key, value, required, options = {}) {
  const text = String(value || "").trim();
  return check(key, urlValid(text, options), text || "missing", required, options.httpsOnly ? "must be a non-placeholder HTTPS URL" : "must be a valid non-placeholder URL");
}

function urlValid(value, options = {}) {
  const text = String(value || "").trim();
  try {
    const parsed = new URL(text);
    return ["http:", "https:"].includes(parsed.protocol) && (!options.httpsOnly || parsed.protocol === "https:") && !PLACEHOLDER.test(parsed.hostname);
  } catch {
    return false;
  }
}

function strongSecret(value, minLength) {
  const text = String(value || "").trim();
  return text.length >= minLength && !PLACEHOLDER.test(text);
}

function check(key, ok, value, required, guidance) {
  return { key, ok: Boolean(ok), required: Boolean(required), value, guidance };
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function backupStorageUrl(env) {
  return env.CYVX_BACKUP_STORAGE_URL || (env.SUPABASE_URL ? `${String(env.SUPABASE_URL).replace(/\/$/, "")}/storage/v1` : "");
}

function backupStorageToken(env) {
  return env.CYVX_BACKUP_STORAGE_TOKEN || env.SUPABASE_SERVICE_ROLE_KEY || env.CYVX_POSTGREST_SERVICE_KEY || "";
}

function inferOidcIssuer(env) {
  const base = String(env.SUPABASE_URL || env.CYVX_POSTGREST_URL || "").replace(/\/$/, "").replace(/\/rest\/v1$/, "");
  return base ? `${base}/auth/v1` : "";
}

function inferEmailProvider(env) {
  if (env.RESEND_API_KEY) return "resend";
  if (env.POSTMARK_SERVER_TOKEN) return "postmark";
  return "";
}

module.exports = {
  assertProductionSecurity,
  authorizeRequest,
  backupStorageToken,
  backupStorageUrl,
  extractCredential,
  inferEmailProvider,
  inferOidcIssuer,
  inspectProductionSecurity,
  isProduction,
  safeEqual,
  strongSecret,
  truthy,
  urlValid,
};
