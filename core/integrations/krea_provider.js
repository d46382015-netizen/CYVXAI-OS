"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const DEFAULT_BASE = "https://api.krea.ai";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_AUDIT_BYTES = 5 * 1024 * 1024;

class KreaProvider {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.fetch = options.fetch || globalThis.fetch;
    this.baseUrl = normalizeBase(this.env.KREA_API_BASE || DEFAULT_BASE);
    this.token = String(this.env.KREA_API_TOKEN || "").trim();
    this.timeoutMs = clampNumber(this.env.KREA_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1_000, 120_000);
    this.auditFile = options.auditFile || this.env.KREA_AUDIT_FILE || path.join(os.homedir(), ".cyvx", "krea-events.jsonl");
    this.now = options.now || (() => new Date().toISOString());
  }

  configured() { return Boolean(this.token); }

  snapshot() {
    return {
      provider: "krea",
      configured: this.configured(),
      endpoint: this.baseUrl,
      mcp_endpoint: "https://api.krea.ai/mcp",
      token_configured: this.configured(),
      audit_file: this.auditFile,
      timeout_ms: this.timeoutMs,
    };
  }

  health() {
    return { ...this.snapshot(), ready: this.configured() };
  }

  async generate(input, context = {}) {
    const body = validateGeneration(input);
    return this.#request("POST", `/generate/${body.model}`, body.input, {
      operation: "generate",
      tenant_id: context.tenant_id || null,
      user_id: context.user_id || null,
      model: body.model,
    });
  }

  async job(jobId, context = {}) {
    const id = validateJobId(jobId);
    return this.#request("GET", `/jobs/${encodeURIComponent(id)}`, undefined, {
      operation: "job",
      tenant_id: context.tenant_id || null,
      user_id: context.user_id || null,
      job_id: id,
    });
  }

  async wait(jobId, options = {}, context = {}) {
    const id = validateJobId(jobId);
    const timeoutMs = clampNumber(options.timeoutMs, 10 * 60_000, 1_000, 30 * 60_000);
    const intervalMs = clampNumber(options.intervalMs, 2_500, 500, 10_000);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await this.job(id, context);
      const status = String(result.status || result.job?.status || "").toLowerCase();
      if (["completed", "failed", "canceled", "cancelled"].includes(status)) return result;
      await sleep(intervalMs);
    }
    const error = new Error(`Krea job ${id} did not complete within ${timeoutMs}ms`);
    error.code = "KREA_JOB_TIMEOUT";
    error.statusCode = 504;
    throw error;
  }

  async #request(method, pathname, payload, auditContext) {
    if (!this.configured()) {
      const error = new Error("KREA_API_TOKEN is not configured");
      error.code = "KREA_NOT_CONFIGURED";
      error.statusCode = 503;
      throw error;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    try {
      const response = await this.fetch(`${this.baseUrl}${pathname}`, {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: "application/json",
          ...(payload === undefined ? {} : { "content-type": "application/json" }),
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 2_000) }; }
      this.#audit({ ...auditContext, method, pathname, status: response.status, duration_ms: Date.now() - started, ok: response.ok });
      if (!response.ok) {
        const error = new Error(data?.message || data?.error || `Krea request failed with HTTP ${response.status}`);
        error.code = "KREA_API_ERROR";
        error.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
        error.details = { status: response.status, data: sanitize(data) };
        throw error;
      }
      return data;
    } catch (error) {
      this.#audit({ ...auditContext, method, pathname, status: error.statusCode || 0, duration_ms: Date.now() - started, ok: false, error: error.code || error.name || "request_error" });
      if (error.code === "KREA_API_ERROR" || error.code === "KREA_NOT_CONFIGURED") throw error;
      const wrapped = new Error(error.name === "AbortError" ? "Krea request timed out" : `Krea request failed: ${error.message}`);
      wrapped.code = error.name === "AbortError" ? "KREA_TIMEOUT" : "KREA_NETWORK_ERROR";
      wrapped.statusCode = 502;
      wrapped.cause = error;
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }
  }

  #audit(event) {
    try {
      const row = JSON.stringify({ id: crypto.randomUUID(), at: this.now(), ...event });
      const dir = path.dirname(this.auditFile);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (fs.existsSync(this.auditFile) && fs.statSync(this.auditFile).size > MAX_AUDIT_BYTES) {
        fs.renameSync(this.auditFile, `${this.auditFile}.1`);
      }
      fs.appendFileSync(this.auditFile, `${row}\n`, { mode: 0o600 });
    } catch {}
  }
}

function validateGeneration(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw bad("KREA_INVALID_INPUT", "generation body must be an object");
  const model = String(value.model || "").trim();
  if (!model || model.startsWith("/") || model.includes("..") || !/^(image|video|enhance)\/[a-z0-9._-]+\/[a-z0-9._-]+(?:\/[a-z0-9._-]+)?$/i.test(model)) {
    throw bad("KREA_INVALID_MODEL", "model must be a valid Krea image/video/enhance model path");
  }
  const input = value.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw bad("KREA_INVALID_INPUT", "input must be an object");
  if (typeof input.prompt !== "undefined" && (typeof input.prompt !== "string" || input.prompt.length > 20_000)) throw bad("KREA_INVALID_PROMPT", "prompt must be a string no longer than 20,000 characters");
  return { model, input };
}

function validateJobId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(id)) throw bad("KREA_INVALID_JOB_ID", "invalid Krea job id");
  return id;
}

function normalizeBase(value) {
  const url = new URL(String(value));
  if (url.protocol !== "https:") throw new Error("KREA_API_BASE must use HTTPS");
  return url.toString().replace(/\/$/, "");
}

function sanitize(value) {
  if (!value || typeof value !== "object") return value;
  const clone = JSON.parse(JSON.stringify(value));
  for (const key of ["token", "api_key", "authorization", "Authorization"]) if (key in clone) clone[key] = "[REDACTED]";
  return clone;
}

function bad(code, message) { const error = new Error(message); error.code = code; error.statusCode = 400; return error; }
function clampNumber(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

module.exports = { KreaProvider, validateGeneration, validateJobId, normalizeBase };
