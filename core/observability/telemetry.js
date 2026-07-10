"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

class Telemetry {
  constructor(options = {}) {
    this.service = options.service || process.env.OTEL_SERVICE_NAME || "cyvxai-os";
    this.environment = options.environment || process.env.CYVX_ENV || process.env.NODE_ENV || "development";
    this.version = options.version || "7.0.0";
    this.logPath = options.logPath || process.env.CYVX_LOG_PATH || "";
    this.maxLogBytes = positive(options.maxLogBytes || process.env.CYVX_LOG_MAX_BYTES, 10 * 1024 * 1024);
    this.maxLogFiles = positive(options.maxLogFiles || process.env.CYVX_LOG_MAX_FILES, 7);
    this.errorWebhook = options.errorWebhook || process.env.CYVX_ERROR_WEBHOOK_URL || "";
    this.otlpEndpoint = String(options.otlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "").replace(/\/$/, "");
    this.otlpHeaders = parseHeaders(options.otlpHeaders || process.env.OTEL_EXPORTER_OTLP_HEADERS || "");
    this.startedAt = Date.now();
    this.counters = Object.create(null);
    this.gauges = Object.create(null);
    this.histograms = Object.create(null);
    this.recentErrors = [];
    this.recentSpans = [];
    this.lastErrorAt = null;
    this.lastExportError = null;
  }

  log(level, event, fields = {}) {
    const record = {
      timestamp: new Date().toISOString(),
      level: normalizeLevel(level),
      event: String(event || "cyvx.event"),
      service: this.service,
      environment: this.environment,
      version: this.version,
      ...sanitize(fields),
    };
    const line = `${JSON.stringify(record)}\n`;
    const stream = record.level === "error" ? process.stderr : process.stdout;
    stream.write(line);
    if (this.logPath) this.#appendFile(line);
    return record;
  }

  increment(name, value = 1) {
    const amount = Number(value);
    if (Number.isFinite(amount)) this.counters[name] = (this.counters[name] || 0) + amount;
    return this.counters[name] || 0;
  }

  gauge(name, value) {
    const amount = Number(value);
    if (Number.isFinite(amount)) this.gauges[name] = amount;
    return this.gauges[name] || 0;
  }

  observe(name, value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    const current = this.histograms[name] || { count: 0, sum: 0, max: 0 };
    current.count += 1;
    current.sum += amount;
    current.max = Math.max(current.max, amount);
    this.histograms[name] = current;
    return current;
  }

  startSpan(name, attributes = {}) {
    const started = process.hrtime.bigint();
    const traceId = crypto.randomBytes(16).toString("hex");
    const spanId = crypto.randomBytes(8).toString("hex");
    return {
      traceId,
      spanId,
      traceparent: `00-${traceId}-${spanId}-01`,
      end: (status = "ok", extra = {}) => {
        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        const span = {
          name,
          trace_id: traceId,
          span_id: spanId,
          started_at: new Date(Date.now() - durationMs).toISOString(),
          ended_at: new Date().toISOString(),
          duration_ms: Number(durationMs.toFixed(3)),
          status,
          attributes: sanitize({ ...attributes, ...extra }),
        };
        this.observe(`span.${name}.duration_ms`, durationMs);
        this.increment(`span.${name}.total`, 1);
        if (status !== "ok") this.increment(`span.${name}.errors`, 1);
        this.recentSpans.unshift(span);
        this.recentSpans.length = Math.min(this.recentSpans.length, 100);
        void this.#exportOtlp("traces", otlpTracePayload(this, span));
        return span;
      },
    };
  }

  captureError(error, context = {}) {
    const normalized = normalizeError(error);
    const record = this.log("error", "cyvx.error", { error: normalized, context });
    this.increment("errors_total", 1);
    this.lastErrorAt = record.timestamp;
    this.recentErrors.unshift(record);
    this.recentErrors.length = Math.min(this.recentErrors.length, 50);
    void this.#notifyError(record);
    void this.#exportOtlp("logs", otlpLogPayload(this, record));
    return record;
  }

  snapshot() {
    return {
      service: this.service,
      environment: this.environment,
      version: this.version,
      uptime_seconds: Math.floor((Date.now() - this.startedAt) / 1000),
      counters: { ...this.counters },
      gauges: { ...this.gauges },
      histograms: clone(this.histograms),
      errors_total: this.counters.errors_total || 0,
      last_error_at: this.lastErrorAt,
      recent_errors: this.recentErrors.slice(0, 10),
      recent_spans: this.recentSpans.slice(0, 20),
      exporters: {
        otlp_configured: Boolean(this.otlpEndpoint),
        error_webhook_configured: Boolean(this.errorWebhook),
        last_export_error: this.lastExportError,
      },
      log: {
        file_enabled: Boolean(this.logPath),
        path: this.logPath || null,
        max_bytes: this.maxLogBytes,
        retained_files: this.maxLogFiles,
      },
    };
  }

  #appendFile(line) {
    try {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
      this.#rotateIfNeeded(Buffer.byteLength(line));
      fs.appendFileSync(this.logPath, line, { mode: 0o600 });
    } catch (error) {
      this.lastExportError = `log_file:${error.message}`;
    }
  }

  #rotateIfNeeded(incomingBytes) {
    let size = 0;
    try { size = fs.statSync(this.logPath).size; } catch {}
    if (size + incomingBytes <= this.maxLogBytes) return;
    for (let index = this.maxLogFiles - 1; index >= 1; index -= 1) {
      const source = `${this.logPath}.${index}`;
      const destination = `${this.logPath}.${index + 1}`;
      if (fs.existsSync(source)) fs.renameSync(source, destination);
    }
    if (fs.existsSync(this.logPath)) fs.renameSync(this.logPath, `${this.logPath}.1`);
    const excess = `${this.logPath}.${this.maxLogFiles + 1}`;
    if (fs.existsSync(excess)) fs.rmSync(excess, { force: true });
  }

  async #notifyError(record) {
    if (!this.errorWebhook || typeof fetch !== "function") return;
    try {
      const response = await fetch(this.errorWebhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "CYVXAI-OS", ...record }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      this.lastExportError = `error_webhook:${error.message}`;
    }
  }

  async #exportOtlp(signal, payload) {
    if (!this.otlpEndpoint || typeof fetch !== "function") return;
    try {
      const response = await fetch(`${this.otlpEndpoint}/v1/${signal}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...this.otlpHeaders },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      this.lastExportError = `otlp_${signal}:${error.message}`;
    }
  }
}

function otlpLogPayload(telemetry, record) {
  return {
    resourceLogs: [{
      resource: { attributes: resourceAttributes(telemetry) },
      scopeLogs: [{ scope: { name: "cyvx.telemetry" }, logRecords: [{
        timeUnixNano: String(BigInt(Date.now()) * 1000000n),
        severityText: record.level.toUpperCase(),
        body: { stringValue: JSON.stringify(record) },
        attributes: [{ key: "event", value: { stringValue: record.event } }],
      }] }],
    }],
  };
}

function otlpTracePayload(telemetry, span) {
  return {
    resourceSpans: [{
      resource: { attributes: resourceAttributes(telemetry) },
      scopeSpans: [{ scope: { name: "cyvx.telemetry" }, spans: [{
        traceId: span.trace_id,
        spanId: span.span_id,
        name: span.name,
        startTimeUnixNano: String(BigInt(Date.parse(span.started_at)) * 1000000n),
        endTimeUnixNano: String(BigInt(Date.parse(span.ended_at)) * 1000000n),
        attributes: Object.entries(span.attributes || {}).map(([key, value]) => ({ key, value: { stringValue: String(value) } })),
        status: { code: span.status === "ok" ? 1 : 2, message: span.status },
      }] }],
    }],
  };
}

function resourceAttributes(telemetry) {
  return [
    { key: "service.name", value: { stringValue: telemetry.service } },
    { key: "service.version", value: { stringValue: telemetry.version } },
    { key: "deployment.environment", value: { stringValue: telemetry.environment } },
  ];
}

function parseHeaders(value) {
  return String(value || "").split(",").reduce((headers, item) => {
    const index = item.indexOf("=");
    if (index > 0) headers[item.slice(0, index).trim()] = item.slice(index + 1).trim();
    return headers;
  }, {});
}

function normalizeError(error) {
  if (!error) return { name: "Error", message: "Unknown error" };
  return {
    name: String(error.name || "Error"),
    message: String(error.message || error),
    code: error.code || null,
    stack: error.stack ? String(error.stack).split("\n").slice(0, 20).join("\n") : null,
  };
}

function sanitize(value, depth = 0) {
  if (depth > 4) return "[max-depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redact(value);
  if (["number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, secretKey(key) ? "[redacted]" : sanitize(item, depth + 1)]));
  }
  return String(value);
}

function redact(value) {
  return String(value).replace(/(bearer\s+)[A-Za-z0-9._~+\/-]+/gi, "$1[redacted]");
}

function secretKey(key) {
  return /(secret|token|password|authorization|api[-_]?key|private[-_]?key|cookie)/i.test(String(key));
}

function normalizeLevel(level) {
  const value = String(level || "info").toLowerCase();
  return ["debug", "info", "warn", "error"].includes(value) ? value : "info";
}

function positive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

module.exports = { Telemetry, normalizeError, parseHeaders, sanitize };
