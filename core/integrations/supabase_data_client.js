"use strict";

class SupabaseDataClient {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.fetch = options.fetch || globalThis.fetch;
    this.baseUrl = restBase(options.baseUrl || this.env.CYVX_POSTGREST_URL || this.env.SUPABASE_URL || "");
    this.serviceKey = String(options.serviceKey || this.env.CYVX_POSTGREST_SERVICE_KEY || this.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    this.schema = String(options.schema || this.env.CYVX_POSTGREST_SCHEMA || "public").trim();
    this.timeoutMs = positive(options.timeoutMs || this.env.CYVX_POSTGREST_TIMEOUT_MS, 10_000);
    this.lastError = null;
    this.lastSuccessAt = null;
    this.requestTotal = 0;
    this.failureTotal = 0;
  }

  configured() {
    return Boolean(this.baseUrl && this.serviceKey && typeof this.fetch === "function");
  }

  async request(resource, options = {}) {
    if (!this.configured()) throw coded("SUPABASE_DATA_UNCONFIGURED", "Supabase Data API is not configured.");
    this.requestTotal += 1;
    const schema = String(options.schema || this.schema);
    const response = await this.fetch(`${this.baseUrl}/${String(resource).replace(/^\/+/, "")}`, {
      ...options,
      headers: {
        authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        accept: "application/json",
        "content-type": "application/json",
        "accept-profile": schema,
        "content-profile": schema,
        ...(options.headers || {}),
      },
      signal: options.signal || AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      this.failureTotal += 1;
      const detail = await safeBody(response);
      this.lastError = `HTTP ${response.status}: ${detail}`;
      throw coded("SUPABASE_DATA_REQUEST_FAILED", this.lastError, response.status);
    }
    this.lastError = null;
    this.lastSuccessAt = new Date().toISOString();
    return response;
  }

  async select(table, query = "", options = {}) {
    const response = await this.request(`${encodeURIComponent(table)}${query ? `?${query}` : ""}`, { method: "GET", ...options });
    return response.json();
  }

  async insert(table, rows, options = {}) {
    const response = await this.request(encodeURIComponent(table), {
      method: "POST",
      body: JSON.stringify(rows),
      headers: { Prefer: options.returnRepresentation === false ? "return=minimal" : "return=representation", ...(options.headers || {}) },
      ...options,
    });
    return options.returnRepresentation === false ? null : response.json();
  }

  async upsert(table, rows, options = {}) {
    const query = options.onConflict ? `?on_conflict=${encodeURIComponent(options.onConflict)}` : "";
    const response = await this.request(`${encodeURIComponent(table)}${query}`, {
      method: "POST",
      body: JSON.stringify(rows),
      headers: { Prefer: `resolution=merge-duplicates,${options.returnRepresentation === false ? "return=minimal" : "return=representation"}`, ...(options.headers || {}) },
      ...options,
    });
    return options.returnRepresentation === false ? null : response.json();
  }

  async rpc(name, args = {}, options = {}) {
    const response = await this.request(`rpc/${encodeURIComponent(name)}`, {
      method: "POST",
      body: JSON.stringify(args),
      schema: options.schema || this.schema,
      headers: options.headers,
    });
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async health() {
    if (!this.configured()) return { configured: false, healthy: false, error: "unconfigured" };
    try {
      await this.select("cyvx_schema_migrations", "select=version&limit=1");
      return { configured: true, healthy: true, checked_at: new Date().toISOString() };
    } catch (error) {
      return { configured: true, healthy: false, error: error.message, checked_at: new Date().toISOString() };
    }
  }

  snapshot() {
    return {
      configured: this.configured(),
      base_url: this.baseUrl || null,
      schema: this.schema,
      request_total: this.requestTotal,
      failure_total: this.failureTotal,
      last_success_at: this.lastSuccessAt,
      last_error: this.lastError,
    };
  }
}

function restBase(value) {
  const text = String(value || "").trim().replace(/\/$/, "");
  if (!text) return "";
  return text.endsWith("/rest/v1") ? text : `${text}/rest/v1`;
}

function positive(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
function coded(code, message, statusCode) { const error = new Error(message); error.code = code; if (statusCode) error.statusCode = statusCode; return error; }
async function safeBody(response) { try { return (await response.text()).slice(0, 1000); } catch { return ""; } }

module.exports = { SupabaseDataClient, restBase };
