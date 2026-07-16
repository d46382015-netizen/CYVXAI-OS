"use strict";

const { truthy } = require("../security/production_guard");

const DEFAULT_FLAGS = Object.freeze({
  "autonomy.enabled": { type: "boolean", value: true, safety: "kill-switch" },
  "external_tools.enabled": { type: "boolean", value: true, safety: "approve-by-default" },
  "paid_operations.enabled": { type: "boolean", value: true, safety: "approve-by-default" },
  "signup.enabled": { type: "boolean", value: true, safety: "approve-by-default" },
  "background_execution.enabled": { type: "boolean", value: true, safety: "kill-switch" },
  "webhook_processing.enabled": { type: "boolean", value: true, safety: "kill-switch" },
  "maintenance.enabled": { type: "boolean", value: false, safety: "operational" },
  "read_only.enabled": { type: "boolean", value: false, safety: "operational" },
  "billing.enabled": { type: "boolean", value: true, safety: "approve-by-default" },
  "analytics.enabled": { type: "boolean", value: true, safety: "approve-by-default" },
  "email.enabled": { type: "boolean", value: true, safety: "approve-by-default" },
  "ai.provider": { type: "string", value: "anthropic", safety: "routing" },
});

class FeatureFlagService {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.data = options.dataClient || null;
    this.environment = String(options.environment || this.env.CYVX_ENV || this.env.NODE_ENV || "development");
    this.required = options.required ?? truthy(this.env.CYVX_REQUIRE_FEATURE_FLAGS);
    this.approveByDefault = options.approveByDefault ?? truthy(this.env.CYVX_APPROVE_BY_DEFAULT ?? "true");
    this.refreshMs = positive(options.refreshMs || this.env.CYVX_FEATURE_FLAG_REFRESH_MS, 30_000);
    this.defaults = mergeDefaults(DEFAULT_FLAGS, parseJson(this.env.CYVX_FEATURE_FLAGS_JSON, {}));
    this.rows = [];
    this.timer = null;
    this.refreshing = null;
    this.lastRefreshAt = null;
    this.lastError = null;
  }

  configured() { return Boolean(this.data && this.data.configured()); }

  start() {
    if (!this.configured() || this.timer) return this.snapshot();
    this.timer = setInterval(() => void this.refresh(), this.refreshMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
    queueMicrotask(() => void this.refresh());
    return this.snapshot();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    return this.snapshot();
  }

  async refresh() {
    if (!this.configured()) return this.snapshot();
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const query = `select=flag_key,flag_type,flag_value,enabled,tenant_id,environment,updated_at&environment=in.(${encodeURIComponent(this.environment)},global)&order=updated_at.desc`;
        const rows = await this.data.select("cyvx_feature_flags", query);
        this.rows = Array.isArray(rows) ? rows.map(normalizeRow).filter(Boolean) : [];
        this.lastRefreshAt = new Date().toISOString();
        this.lastError = null;
      } catch (error) {
        this.lastError = error.message;
      } finally {
        this.refreshing = null;
      }
      return this.snapshot();
    })();
    return this.refreshing;
  }

  evaluate(key, defaultValue, context = {}) {
    const flagKey = String(key || "");
    const tenantId = context.tenantId || context.tenant_id || null;
    const row = this.#find(flagKey, tenantId);
    if (row) {
      if (!row.enabled) {
        const deniedValue = row.flag_type === "boolean" || typeof defaultValue === "boolean" ? false : defaultValue;
        return detail(flagKey, deniedValue, "EXPLICIT_DENY", "database", row);
      }
      const converted = convert(row.flag_value, row.flag_type, defaultValue);
      return detail(flagKey, converted, "TARGETING_MATCH", row.tenant_id ? "tenant" : "environment", row);
    }
    const configured = this.defaults[flagKey];
    if (configured) return detail(flagKey, configured.value, "DEFAULT", "configuration", configured);
    if (this.approveByDefault && typeof defaultValue === "boolean") {
      return detail(flagKey, true, "APPROVE_BY_DEFAULT", "policy", null);
    }
    return detail(flagKey, defaultValue, "FLAG_NOT_FOUND", "caller", null);
  }

  getBooleanValue(key, defaultValue, context) { return Boolean(this.evaluate(key, defaultValue, context).value); }
  getStringValue(key, defaultValue, context) { return String(this.evaluate(key, defaultValue, context).value); }
  getNumberValue(key, defaultValue, context) { const value = Number(this.evaluate(key, defaultValue, context).value); return Number.isFinite(value) ? value : Number(defaultValue); }
  getObjectValue(key, defaultValue, context) { const value = this.evaluate(key, defaultValue, context).value; return value && typeof value === "object" ? value : defaultValue; }
  getDetails(key, defaultValue, context) { return this.evaluate(key, defaultValue, context); }

  async setFlag(key, value, options = {}) {
    if (!this.configured()) throw coded("FEATURE_FLAG_STORE_UNCONFIGURED", "Managed feature-flag storage is not configured.");
    const flagKey = String(key || "");
    if (!/^[a-z][a-z0-9._-]{2,127}$/.test(flagKey)) throw coded("FEATURE_FLAG_KEY_INVALID", "Feature flag key is invalid.");
    const type = inferType(value);
    const row = {
      flag_key: flagKey,
      flag_type: type,
      flag_value: value,
      enabled: options.enabled !== false,
      tenant_id: options.tenantId || null,
      environment: options.environment || this.environment,
      updated_by: options.updatedBy || null,
      updated_at: new Date().toISOString(),
    };
    await this.data.upsert("cyvx_feature_flags", row, { onConflict: "flag_key,environment,tenant_id", returnRepresentation: false });
    await this.refresh();
    return row;
  }

  list(context = {}) {
    const keys = new Set([...Object.keys(this.defaults), ...this.rows.map((row) => row.flag_key)]);
    return [...keys].sort().map((key) => this.evaluate(key, this.defaults[key] && this.defaults[key].value, context));
  }

  openFeatureProvider() { return new OpenFeatureProviderAdapter(this); }

  snapshot() {
    return {
      configured: this.configured(),
      required: this.required,
      approve_by_default: this.approveByDefault,
      environment: this.environment,
      scheduled: Boolean(this.timer),
      refresh_ms: this.refreshMs,
      cached_rows: this.rows.length,
      known_flags: [...new Set([...Object.keys(this.defaults), ...this.rows.map((row) => row.flag_key)])].sort(),
      last_refresh_at: this.lastRefreshAt,
      last_error: this.lastError,
    };
  }

  #find(key, tenantId) {
    const matches = this.rows.filter((row) => row.flag_key === key && (row.environment === this.environment || row.environment === "global"));
    return matches.find((row) => tenantId && String(row.tenant_id || "") === String(tenantId)) || matches.find((row) => !row.tenant_id) || null;
  }
}

class OpenFeatureProviderAdapter {
  constructor(service) {
    this.service = service;
    this.metadata = { name: "CYVXManagedFeatureFlags", version: "1.1.0" };
    this.runsOn = "server";
  }

  async initialize() { await this.service.refresh(); }
  async onClose() { this.service.stop(); }
  resolveBooleanEvaluation(key, defaultValue, context) { return openFeatureDetail(this.service.evaluate(key, defaultValue, context)); }
  resolveStringEvaluation(key, defaultValue, context) { return openFeatureDetail(this.service.evaluate(key, defaultValue, context)); }
  resolveNumberEvaluation(key, defaultValue, context) { return openFeatureDetail(this.service.evaluate(key, defaultValue, context)); }
  resolveObjectEvaluation(key, defaultValue, context) { return openFeatureDetail(this.service.evaluate(key, defaultValue, context)); }
}

function openFeatureDetail(value) {
  return {
    value: value.value,
    variant: value.variant,
    reason: value.reason,
    flagMetadata: { source: value.source, updated_at: value.updated_at || "" },
  };
}

function detail(key, value, reason, source, row) {
  return {
    flag_key: key,
    value,
    reason,
    source,
    variant: `${source}:${reason.toLowerCase()}`,
    tenant_id: row && row.tenant_id || null,
    environment: row && row.environment || null,
    updated_at: row && row.updated_at || null,
  };
}

function normalizeRow(row) {
  if (!row || !row.flag_key) return null;
  return {
    flag_key: String(row.flag_key),
    flag_type: String(row.flag_type || inferType(row.flag_value)),
    flag_value: row.flag_value,
    enabled: row.enabled !== false,
    tenant_id: row.tenant_id || null,
    environment: String(row.environment || "global"),
    updated_at: row.updated_at || null,
  };
}

function mergeDefaults(base, overrides) {
  const result = JSON.parse(JSON.stringify(base));
  for (const [key, value] of Object.entries(overrides || {})) result[key] = { type: inferType(value), value, safety: "environment" };
  return result;
}

function convert(value, type, fallback) {
  if (type === "boolean") return value === true || value === "true" || value === 1;
  if (type === "number") { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
  if (type === "string") return String(value);
  if (type === "object") return value && typeof value === "object" ? value : fallback;
  return value;
}

function inferType(value) {
  if (value === null || Array.isArray(value) || typeof value === "object") return "object";
  if (["boolean", "number", "string"].includes(typeof value)) return typeof value;
  return "string";
}

function parseJson(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function positive(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback; }
function coded(code, message) { const error = new Error(message); error.code = code; return error; }

module.exports = { DEFAULT_FLAGS, FeatureFlagService, OpenFeatureProviderAdapter, inferType, normalizeRow };
