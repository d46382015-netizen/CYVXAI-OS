"use strict";

const crypto = require("node:crypto");
const { truthy } = require("../security/production_guard");

class AITrace {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.telemetry = options.telemetry || null;
    this.fetch = options.fetch || globalThis.fetch;
    this.endpoint = String(options.endpoint || this.env.LANGFUSE_OTLP_ENDPOINT || "").replace(/\/$/, "");
    this.headers = parseHeaders(options.headers || this.env.LANGFUSE_OTLP_HEADERS || "");
    this.service = String(options.service || this.env.OTEL_SERVICE_NAME || "cyvxai-os");
    this.environment = String(options.environment || this.env.CYVX_ENV || this.env.NODE_ENV || "development");
    this.captureContent = options.captureContent ?? truthy(this.env.CYVX_AI_TRACE_CONTENT);
    this.required = options.required ?? truthy(this.env.CYVX_REQUIRE_AI_OBSERVABILITY);
    this.metrics = { spans: 0, generations: 0, scores: 0, failures: 0, last_export_at: null, last_error: null };
  }

  configured() { return Boolean(this.endpoint && typeof this.fetch === "function"); }

  startGeneration(name, attributes = {}) {
    const startedAt = Date.now();
    const traceId = normalizeTraceId(attributes.trace_id) || crypto.randomBytes(16).toString("hex");
    const spanId = crypto.randomBytes(8).toString("hex");
    const local = this.telemetry && this.telemetry.startSpan("ai.generation", safeAttributes({
      generation_name: name,
      trace_id: traceId,
      tenant_id: attributes.tenant_id,
      mission_id: attributes.mission_id,
      agent_id: attributes.agent_id,
      model: attributes.model,
      provider: attributes.provider,
      prompt_version: attributes.prompt_version,
    }));
    this.metrics.generations += 1;
    return {
      trace_id: traceId,
      span_id: spanId,
      end: async (result = {}) => {
        const endedAt = Date.now();
        const status = result.error ? "error" : "ok";
        if (local) local.end(status, { error: result.error && String(result.error.message || result.error), duration_ms: endedAt - startedAt });
        const attrs = this.#generationAttributes(name, attributes, result);
        await this.#exportSpan({ traceId, spanId, name: `generation:${name}`, startedAt, endedAt, status, attributes: attrs });
        return { trace_id: traceId, span_id: spanId, duration_ms: endedAt - startedAt, status };
      },
    };
  }

  async score(options = {}) {
    const value = Number(options.value);
    if (!Number.isFinite(value)) throw coded("AI_SCORE_INVALID", "AI evaluation score must be numeric.");
    const now = Date.now();
    const traceId = normalizeTraceId(options.trace_id) || crypto.randomBytes(16).toString("hex");
    const spanId = crypto.randomBytes(8).toString("hex");
    this.metrics.scores += 1;
    await this.#exportSpan({
      traceId,
      spanId,
      name: `evaluation:${String(options.name || "score")}`,
      startedAt: now,
      endedAt: now + 1,
      status: "ok",
      attributes: safeAttributes({
        "langfuse.observation.type": "span",
        "cyvx.evaluation.name": options.name || "score",
        "cyvx.evaluation.value": value,
        "cyvx.evaluation.comment": options.comment || "",
        "cyvx.tenant_id": options.tenant_id || "",
        "cyvx.mission_id": options.mission_id || "",
      }),
    });
    return { ok: true, trace_id: traceId, score: value };
  }

  snapshot() {
    return {
      configured: this.configured(),
      required: this.required,
      endpoint: this.endpoint ? redactEndpoint(this.endpoint) : null,
      capture_content: this.captureContent,
      metrics: { ...this.metrics },
    };
  }

  #generationAttributes(name, input, result) {
    const attributes = {
      "langfuse.observation.type": "generation",
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": input.provider || "unknown",
      "gen_ai.request.model": input.model || "unknown",
      "gen_ai.response.model": result.model || input.model || "unknown",
      "gen_ai.usage.input_tokens": number(result.input_tokens || result.usage && result.usage.input_tokens),
      "gen_ai.usage.output_tokens": number(result.output_tokens || result.usage && result.usage.output_tokens),
      "cyvx.generation.name": name,
      "cyvx.tenant_id": input.tenant_id || "",
      "cyvx.mission_id": input.mission_id || "",
      "cyvx.agent_id": input.agent_id || "",
      "cyvx.prompt_version": input.prompt_version || "",
      "cyvx.tool_count": Array.isArray(result.tool_calls) ? result.tool_calls.length : number(result.tool_count),
      "cyvx.cost_usd": number(result.cost_usd),
      "cyvx.outcome": result.outcome || "",
    };
    const prompt = input.prompt || input.input;
    const output = result.output || result.response;
    if (this.captureContent) {
      attributes["gen_ai.prompt"] = bounded(prompt, 20_000);
      attributes["gen_ai.completion"] = bounded(output, 20_000);
    } else {
      attributes["cyvx.prompt_sha256"] = hashContent(prompt);
      attributes["cyvx.prompt_length"] = textLength(prompt);
      attributes["cyvx.output_sha256"] = hashContent(output);
      attributes["cyvx.output_length"] = textLength(output);
    }
    if (result.error) attributes["error.message"] = bounded(result.error.message || result.error, 1000);
    return safeAttributes(attributes);
  }

  async #exportSpan(span) {
    this.metrics.spans += 1;
    if (!this.configured()) return { ok: false, skipped: true };
    try {
      const response = await this.fetch(traceEndpoint(this.endpoint), {
        method: "POST",
        headers: { "content-type": "application/json", ...this.headers },
        body: JSON.stringify(otlpPayload(this, span)),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Langfuse OTLP export failed with HTTP ${response.status}`);
      this.metrics.last_export_at = new Date().toISOString();
      this.metrics.last_error = null;
      return { ok: true };
    } catch (error) {
      this.metrics.failures += 1;
      this.metrics.last_error = error.message;
      if (this.telemetry && typeof this.telemetry.captureError === "function") this.telemetry.captureError(error, { operation: "ai_trace_export" });
      if (this.required) throw error;
      return { ok: false, error: error.message };
    }
  }
}

function otlpPayload(client, span) {
  return {
    resourceSpans: [{
      resource: { attributes: [
        kv("service.name", client.service),
        kv("deployment.environment", client.environment),
        kv("service.namespace", "cyvx"),
      ] },
      scopeSpans: [{
        scope: { name: "cyvx.ai", version: "1.0.0" },
        spans: [{
          traceId: span.traceId,
          spanId: span.spanId,
          name: span.name,
          kind: 1,
          startTimeUnixNano: String(BigInt(span.startedAt) * 1000000n),
          endTimeUnixNano: String(BigInt(span.endedAt) * 1000000n),
          attributes: Object.entries(span.attributes || {}).map(([key, value]) => kv(key, value)),
          status: { code: span.status === "ok" ? 1 : 2, message: span.status },
        }],
      }],
    }],
  };
}

function kv(key, value) {
  if (typeof value === "boolean") return { key, value: { boolValue: value } };
  if (typeof value === "number" && Number.isFinite(value)) return Number.isInteger(value) ? { key, value: { intValue: String(value) } } : { key, value: { doubleValue: value } };
  return { key, value: { stringValue: String(value ?? "") } };
}

function traceEndpoint(endpoint) { return /\/v1\/traces$/.test(endpoint) ? endpoint : `${endpoint}/v1/traces`; }
function normalizeTraceId(value) { const text = String(value || "").replace(/[^a-f0-9]/gi, "").toLowerCase(); return text.length === 32 ? text : ""; }
function safeAttributes(value) { return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item !== undefined && item !== null).slice(0, 100)); }
function parseHeaders(value) { return String(value || "").split(",").reduce((out, item) => { const index = item.indexOf("="); if (index > 0) out[item.slice(0, index).trim()] = item.slice(index + 1).trim(); return out; }, {}); }
function bounded(value, limit) { const text = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value); return text.slice(0, limit); }
function hashContent(value) { const text = bounded(value, 100_000); return text ? crypto.createHash("sha256").update(text).digest("hex") : ""; }
function textLength(value) { return bounded(value, 100_000).length; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function redactEndpoint(value) { try { const url = new URL(value); return `${url.protocol}//${url.host}${url.pathname}`; } catch { return "configured"; } }
function coded(code, message) { const error = new Error(message); error.code = code; return error; }

module.exports = { AITrace, hashContent, otlpPayload, traceEndpoint };
