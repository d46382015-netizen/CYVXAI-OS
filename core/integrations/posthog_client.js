"use strict";

const crypto = require("node:crypto");
const { approvedByDefault, truthy } = require("../security/production_guard");

const ALLOWED_PROPERTIES = new Set([
  "source", "feature", "plan", "result", "status", "provider", "model",
  "environment", "release", "version", "duration_ms", "latency_ms",
  "input_tokens", "output_tokens", "tool_count", "retry_count", "http_status",
]);

class PostHogClient {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.fetch = options.fetch || globalThis.fetch;
    this.apiKey = String(options.apiKey || this.env.POSTHOG_API_KEY || "").trim();
    this.host = String(options.host || this.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
    this.salt = String(options.salt || this.env.CYVX_ANALYTICS_SALT || "");
    this.enabled = options.enabled ?? approvedByDefault(this.env.CYVX_PRODUCT_ANALYTICS_ENABLED);
    this.required = options.required ?? truthy(this.env.CYVX_REQUIRE_PRODUCT_ANALYTICS);
    this.environment = String(options.environment || this.env.CYVX_ENV || this.env.NODE_ENV || "development");
    this.release = String(options.release || this.env.CYVX_RELEASE_SHA || "unknown");
    this.metrics = { captured: 0, delivered: 0, dropped: 0, failures: 0, last_delivery_at: null, last_error: null };
  }

  configured() { return Boolean(this.apiKey && this.salt.length >= 32 && typeof this.fetch === "function"); }

  async capture(event, options = {}) {
    const eventName = String(event || "").trim();
    if (!/^[A-Za-z0-9._:-]{2,160}$/.test(eventName)) throw coded("ANALYTICS_EVENT_INVALID", "Analytics event name is invalid.");
    if (!this.enabled) { this.metrics.dropped += 1; return { ok: false, disabled: true }; }
    if (!this.configured()) {
      this.metrics.dropped += 1;
      if (this.required) throw coded("POSTHOG_UNCONFIGURED", "Product analytics is required but not configured.");
      return { ok: false, skipped: true };
    }
    const distinctId = pseudonym(options.distinctId || options.userId || "anonymous", this.salt);
    const tenantId = options.tenantId ? pseudonym(options.tenantId, this.salt) : null;
    const payload = {
      api_key: this.apiKey,
      event: eventName,
      properties: {
        distinct_id: distinctId,
        tenant_id: tenantId,
        $lib: "cyvx-native",
        $lib_version: "1.0.0",
        environment: this.environment,
        release: this.release,
        ...sanitizeProperties(options.properties),
      },
      timestamp: options.timestamp || new Date().toISOString(),
    };
    this.metrics.captured += 1;
    try {
      const response = await this.fetch(`${this.host}/capture/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`PostHog capture failed with HTTP ${response.status}`);
      this.metrics.delivered += 1;
      this.metrics.last_delivery_at = new Date().toISOString();
      this.metrics.last_error = null;
      return { ok: true };
    } catch (error) {
      this.metrics.failures += 1;
      this.metrics.last_error = error.message;
      if (this.required) throw error;
      return { ok: false, error: error.message };
    }
  }

  snapshot() {
    return {
      configured: this.configured(),
      enabled: this.enabled,
      required: this.required,
      host: this.host,
      privacy: { pseudonymous_ids: true, property_allowlist: [...ALLOWED_PROPERTIES].sort(), content_capture: false },
      metrics: { ...this.metrics },
    };
  }
}

function sanitizeProperties(input) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!ALLOWED_PROPERTIES.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (["string", "number", "boolean"].includes(typeof value)) output[key] = typeof value === "string" ? value.slice(0, 500) : value;
  }
  return output;
}

function pseudonym(value, salt) {
  return crypto.createHmac("sha256", salt).update(String(value || "anonymous")).digest("hex");
}

function coded(code, message) { const error = new Error(message); error.code = code; return error; }

module.exports = { ALLOWED_PROPERTIES, PostHogClient, pseudonym, sanitizeProperties };
