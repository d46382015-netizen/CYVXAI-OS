"use strict";

const crypto = require("node:crypto");

class ManagedDataPlane {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.baseUrl = String(options.baseUrl || this.env.CYVX_POSTGREST_URL || "").replace(/\/$/, "");
    this.serviceKey = String(options.serviceKey || this.env.CYVX_POSTGREST_SERVICE_KEY || "");
    this.schema = String(options.schema || this.env.CYVX_POSTGREST_SCHEMA || "public");
    this.environment = String(options.environment || this.env.CYVX_ENV || this.env.NODE_ENV || "development");
    this.instanceId = String(options.instanceId || this.env.CYVX_INSTANCE_ID || crypto.randomUUID());
    this.intervalMs = positive(options.intervalMs || this.env.CYVX_MANAGED_DATA_INTERVAL_MS, 60_000);
    this.required = truthy(options.required ?? this.env.CYVX_REQUIRE_MANAGED_DATA);
    this.telemetry = options.telemetry || null;
    this.snapshotProvider = options.snapshotProvider || null;
    this.timer = null;
    this.running = false;
    this.state = { configured: this.configured(), healthy: null, last_sync_at: null, last_error: null, sync_total: 0, failure_total: 0 };
  }

  configured() { return Boolean(this.baseUrl && this.serviceKey); }

  async health() {
    if (!this.configured()) {
      const result = { configured: false, healthy: !this.required, required: this.required, error: this.required ? "managed_data_unconfigured" : null };
      this.state = { ...this.state, ...result };
      return result;
    }
    try {
      const response = await this.#request("cyvx_runtime_snapshots?select=id&limit=1", { method: "GET" });
      const result = { configured: true, healthy: response.ok, required: this.required, status: response.status, error: response.ok ? null : await safeText(response) };
      this.state = { ...this.state, ...result, checked_at: new Date().toISOString() };
      return result;
    } catch (error) {
      const result = { configured: true, healthy: false, required: this.required, error: error.message };
      this.state = { ...this.state, ...result, checked_at: new Date().toISOString() };
      return result;
    }
  }

  start(snapshotProvider = this.snapshotProvider) {
    this.snapshotProvider = snapshotProvider;
    if (!this.configured() || !snapshotProvider || this.timer) return this;
    this.timer = setTimeout(() => this.#tick(), 5_000);
    if (typeof this.timer.unref === "function") this.timer.unref();
    return this;
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async sync(snapshot = this.snapshotProvider && this.snapshotProvider()) {
    if (!this.configured()) {
      if (this.required) throw coded("CYVX_MANAGED_DATA_UNCONFIGURED", "managed PostgreSQL data plane is required but not configured");
      return { ok: false, skipped: true, reason: "unconfigured" };
    }
    if (!snapshot || typeof snapshot !== "object") throw coded("CYVX_MANAGED_DATA_SNAPSHOT_INVALID", "runtime snapshot is required");
    if (this.running) return { ok: false, skipped: true, reason: "sync_already_running" };
    this.running = true;
    const started = Date.now();
    const span = this.telemetry && this.telemetry.startSpan("managed_data.sync", { environment: this.environment });
    try {
      const payload = {
        environment: this.environment,
        instance_id: this.instanceId,
        service_version: String(snapshot.version || "7.0.0"),
        readiness_score: Number(snapshot.readiness && snapshot.readiness.score || 0),
        operating_state: String(snapshot.operating_state && snapshot.operating_state.grade || snapshot.readiness && snapshot.readiness.grade || "unknown"),
        snapshot,
        observed_at: new Date().toISOString(),
      };
      const response = await this.#request("cyvx_runtime_snapshots?on_conflict=environment,instance_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw coded("CYVX_MANAGED_DATA_SYNC_FAILED", `managed data sync failed: HTTP ${response.status} ${await safeText(response)}`);
      this.state = {
        ...this.state,
        configured: true,
        healthy: true,
        last_sync_at: payload.observed_at,
        last_duration_ms: Date.now() - started,
        last_error: null,
        sync_total: Number(this.state.sync_total || 0) + 1,
      };
      if (this.telemetry) {
        this.telemetry.increment("managed_data_sync_total", 1);
        this.telemetry.gauge("managed_data_last_sync_timestamp_seconds", Math.floor(Date.now() / 1000));
      }
      if (span) span.end("ok");
      return { ok: true, observed_at: payload.observed_at, status: response.status };
    } catch (error) {
      this.state = {
        ...this.state,
        healthy: false,
        last_error: { code: error.code || "SYNC_FAILED", message: error.message },
        failure_total: Number(this.state.failure_total || 0) + 1,
      };
      if (this.telemetry) {
        this.telemetry.increment("managed_data_failure_total", 1);
        this.telemetry.captureError(error, { operation: "managed_data_sync" });
      }
      if (span) span.end("error", { error: error.code || error.message });
      throw error;
    } finally {
      this.running = false;
    }
  }

  async recordIncident(incident) {
    if (!this.configured()) return { ok: false, skipped: true };
    const response = await this.#request("cyvx_incidents", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        environment: this.environment,
        incident_key: incident.incident_key || crypto.randomUUID(),
        severity: incident.severity || "warning",
        status: incident.status || "open",
        title: incident.title || "CYVX incident",
        detail: incident.detail || {},
        started_at: incident.started_at || new Date().toISOString(),
        resolved_at: incident.resolved_at || null,
      }),
    });
    if (!response.ok) throw coded("CYVX_INCIDENT_PERSIST_FAILED", `incident persistence failed: HTTP ${response.status} ${await safeText(response)}`);
    return { ok: true, status: response.status };
  }

  snapshot() {
    return { ...this.state, required: this.required, environment: this.environment, instance_id: this.instanceId, interval_ms: this.intervalMs, running: this.running };
  }

  async #tick() {
    try { await this.sync(); }
    catch {}
    finally {
      if (this.configured() && this.snapshotProvider) {
        this.timer = setTimeout(() => this.#tick(), this.intervalMs);
        if (typeof this.timer.unref === "function") this.timer.unref();
      }
    }
  }

  #request(resource, options = {}) {
    return fetch(`${this.baseUrl}/rest/v1/${resource}`, {
      ...options,
      headers: {
        authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        "content-profile": this.schema,
        "accept-profile": this.schema,
        "content-type": "application/json",
        ...(options.headers || {}),
      },
      signal: options.signal || AbortSignal.timeout(10_000),
    });
  }
}

function truthy(value) { return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase()); }
function positive(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
function coded(code, message) { const error = new Error(message); error.code = code; return error; }
async function safeText(response) { try { return (await response.text()).slice(0, 500); } catch { return ""; } }

module.exports = { ManagedDataPlane };
