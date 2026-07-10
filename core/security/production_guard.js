"use strict";

const crypto = require("node:crypto");

const PLACEHOLDER = /(replace[-_ ]?with|changeme|example\.com|your[-_ ]?project|placeholder)/i;

function isProduction(env = process.env) {
  return String(env.NODE_ENV || env.CYVX_ENV || "").toLowerCase() === "production";
}

function inspectProductionSecurity(env = process.env) {
  const production = isProduction(env);
  const managedDataRequired = truthy(env.CYVX_REQUIRE_MANAGED_DATA);
  const backupsRequired = truthy(env.CYVX_BACKUP_ENABLED);
  const checks = [
    secretCheck("CYVX_API_KEY", env.CYVX_API_KEY, 32, production),
    valueCheck("CYVX_OWNER_ID", env.CYVX_OWNER_ID, production),
    secretCheck("CYVX_OPERATOR_SESSION_SECRET", env.CYVX_OPERATOR_SESSION_SECRET, 32, production),
    urlCheck("APP_BASE_URL", env.APP_BASE_URL, production, { httpsOnly: production }),
    check("CYVX_ALLOW_INSECURE_LOCAL", !truthy(env.CYVX_ALLOW_INSECURE_LOCAL), String(env.CYVX_ALLOW_INSECURE_LOCAL || "false"), production, "must be false in production"),
    urlCheck("CYVX_POSTGREST_URL", env.CYVX_POSTGREST_URL, managedDataRequired, { httpsOnly: production }),
    secretCheck("CYVX_POSTGREST_SERVICE_KEY", env.CYVX_POSTGREST_SERVICE_KEY, 24, managedDataRequired),
    secretCheck("CYVX_BACKUP_ENCRYPTION_KEY", env.CYVX_BACKUP_ENCRYPTION_KEY, 32, backupsRequired),
    urlCheck("CYVX_BACKUP_STORAGE_URL", backupStorageUrl(env), backupsRequired, { httpsOnly: production }),
    secretCheck("CYVX_BACKUP_STORAGE_TOKEN", backupStorageToken(env), 24, backupsRequired),
    valueCheck("CYVX_BACKUP_BUCKET", env.CYVX_BACKUP_BUCKET, backupsRequired),
  ];
  const failed = checks.filter((item) => item.required && !item.ok);
  return {
    ok: failed.length === 0,
    production,
    managed_data_required: managedDataRequired,
    backups_required: backupsRequired,
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
  const ok = text.length >= minLength && !PLACEHOLDER.test(text);
  return check(key, ok, text ? `configured:${text.length}` : "missing", required, `must be a non-placeholder secret of at least ${minLength} characters`);
}

function valueCheck(key, value, required) {
  const text = String(value || "").trim();
  return check(key, Boolean(text) && !PLACEHOLDER.test(text), text ? "configured" : "missing", required, "must be configured with a non-placeholder value");
}

function urlCheck(key, value, required, options = {}) {
  const text = String(value || "").trim();
  let ok = false;
  try {
    const parsed = new URL(text);
    ok = ["http:", "https:"].includes(parsed.protocol) && (!options.httpsOnly || parsed.protocol === "https:") && !PLACEHOLDER.test(parsed.hostname);
  } catch {
    ok = false;
  }
  return check(key, ok, text || "missing", required, options.httpsOnly ? "must be a non-placeholder HTTPS URL" : "must be a valid non-placeholder URL");
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

module.exports = {
  assertProductionSecurity,
  authorizeRequest,
  backupStorageToken,
  backupStorageUrl,
  extractCredential,
  inspectProductionSecurity,
  isProduction,
  safeEqual,
  truthy,
};
