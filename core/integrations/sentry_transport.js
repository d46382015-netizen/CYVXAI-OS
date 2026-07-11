"use strict";

const crypto = require("node:crypto");
const os = require("node:os");
const { truthy } = require("../security/production_guard");

class SentryTransport {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.fetch = options.fetch || globalThis.fetch;
    this.dsn = parseDsn(options.dsn || this.env.SENTRY_DSN || "");
    this.environment = String(options.environment || this.env.CYVX_ENV || this.env.NODE_ENV || "development");
    this.release = String(options.release || this.env.SENTRY_RELEASE || this.env.CYVX_RELEASE_SHA || "unknown");
    this.required = options.required ?? truthy(this.env.CYVX_REQUIRE_ERROR_TRACKING);
    this.sampleRate = boundedNumber(options.sampleRate ?? this.env.SENTRY_SAMPLE_RATE, 1, 0, 1);
    this.metrics = { captured: 0, delivered: 0, dropped: 0, failures: 0, last_event_id: null, last_delivery_at: null, last_error: null };
  }

  configured() { return Boolean(this.dsn && typeof this.fetch === "function"); }

  async captureException(error, context = {}) {
    if (Math.random() > this.sampleRate) {
      this.metrics.dropped += 1;
      return { ok: false, sampled: false };
    }
    const eventId = crypto.randomBytes(16).toString("hex");
    const event = buildEvent(eventId, error, context, this);
    this.metrics.captured += 1;
    this.metrics.last_event_id = eventId;
    if (!this.configured()) {
      this.metrics.dropped += 1;
      if (this.required) throw coded("SENTRY_UNCONFIGURED", "Sentry error tracking is required but not configured.");
      return { ok: false, skipped: true, event_id: eventId };
    }
    try {
      const response = await this.fetch(this.dsn.envelopeUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-sentry-envelope",
          "x-sentry-auth": `Sentry sentry_version=7, sentry_client=cyvx-native/1.0.0, sentry_key=${this.dsn.publicKey}`,
        },
        body: envelope(eventId, event),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Sentry envelope failed with HTTP ${response.status}`);
      this.metrics.delivered += 1;
      this.metrics.last_delivery_at = new Date().toISOString();
      this.metrics.last_error = null;
      return { ok: true, event_id: eventId };
    } catch (cause) {
      this.metrics.failures += 1;
      this.metrics.last_error = cause.message;
      if (this.required) throw cause;
      return { ok: false, event_id: eventId, error: cause.message };
    }
  }

  snapshot() {
    return {
      configured: this.configured(),
      required: this.required,
      host: this.dsn && this.dsn.host || null,
      project_id: this.dsn && this.dsn.projectId || null,
      environment: this.environment,
      release: this.release,
      sample_rate: this.sampleRate,
      metrics: { ...this.metrics },
    };
  }
}

function parseDsn(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    const parsed = new URL(text);
    const projectId = parsed.pathname.split("/").filter(Boolean).pop();
    if (!parsed.username || !projectId) return null;
    const pathPrefix = parsed.pathname.split("/").filter(Boolean).slice(0, -1).join("/");
    const base = `${parsed.protocol}//${parsed.host}${pathPrefix ? `/${pathPrefix}` : ""}`;
    return {
      publicKey: decodeURIComponent(parsed.username),
      projectId,
      host: parsed.host,
      envelopeUrl: `${base}/api/${encodeURIComponent(projectId)}/envelope/`,
    };
  } catch {
    return null;
  }
}

function buildEvent(eventId, error, context, client) {
  const normalized = normalizeError(error);
  return {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: "node",
    level: context.level || "error",
    environment: client.environment,
    release: client.release,
    server_name: os.hostname(),
    logger: "cyvx",
    transaction: context.operation || context.transaction || "cyvx.runtime",
    exception: { values: [{ type: normalized.name, value: normalized.message, stacktrace: stacktrace(normalized.stack) }] },
    tags: sanitizeTags({ service: "cyvxai-os", component: context.component, tenant_id: context.tenant_id, mission_id: context.mission_id, ...context.tags }),
    extra: sanitizeExtra(context.extra || context),
    contexts: {
      runtime: { name: "node", version: process.version },
      cyvx: { trace_id: context.trace_id || null, agent_id: context.agent_id || null, job_id: context.job_id || null },
    },
  };
}

function envelope(eventId, event) {
  return `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event", content_type: "application/json" })}\n${JSON.stringify(event)}`;
}

function normalizeError(error) {
  return {
    name: String(error && error.name || "Error"),
    message: String(error && error.message || error || "Unknown error").slice(0, 2000),
    stack: error && error.stack ? String(error.stack) : "",
  };
}

function stacktrace(stack) {
  if (!stack) return undefined;
  return { frames: String(stack).split("\n").slice(1, 30).reverse().map((line) => ({ filename: line.trim().slice(0, 500), function: "unknown", in_app: true })) };
}

function sanitizeTags(tags) {
  const output = {};
  for (const [key, value] of Object.entries(tags || {})) {
    if (value === undefined || value === null || secretKey(key)) continue;
    output[String(key).slice(0, 64)] = String(value).slice(0, 200);
  }
  return output;
}

function sanitizeExtra(value, depth = 0) {
  if (depth > 3) return "[max-depth]";
  if (value === null || value === undefined) return value;
  if (["string", "number", "boolean"].includes(typeof value)) return typeof value === "string" ? redact(value).slice(0, 2000) : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeExtra(item, depth + 1));
  if (typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 50)) output[key] = secretKey(key) ? "[redacted]" : sanitizeExtra(item, depth + 1);
    return output;
  }
  return String(value);
}

function secretKey(key) { return /(secret|token|password|authorization|api[-_]?key|private[-_]?key|cookie|prompt|completion|email)/i.test(String(key)); }
function redact(value) { return String(value).replace(/(bearer\s+)[A-Za-z0-9._~+\/-]+/gi, "$1[redacted]"); }
function boundedNumber(value, fallback, min, max) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
function coded(code, message) { const error = new Error(message); error.code = code; return error; }

module.exports = { SentryTransport, buildEvent, envelope, parseDsn };
