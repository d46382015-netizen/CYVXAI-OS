"use strict";

const { readiness } = require("./readiness");

function runtimeSnapshot({ sparkRuntime, autonomy, backup, managedData, telemetry, security = {}, cyvx, github = {}, startedAt = Date.now() }) {
  const spark = sparkRuntime.snapshot();
  const metrics = spark.metrics || {};
  const sparkHealth = safely(() => sparkRuntime.health(), { status: "error" });
  const cyvxStatus = safely(() => cyvx.controller.status(), { status: "error" });
  const autonomyState = autonomy.snapshot();
  const backupState = backup && typeof backup.snapshot === "function" ? backup.snapshot() : { enabled: false };
  const managedDataState = managedData && typeof managedData.snapshot === "function" ? managedData.snapshot() : { configured: false, required: false };
  const telemetryState = telemetry && typeof telemetry.snapshot === "function" ? telemetry.snapshot() : { errors_total: 0, exporters: {} };
  const pending = spark.sparks.filter((item) => item.status === "awaiting_approval").length;
  const active = spark.sparks.filter((item) => item.status === "active").length;
  const operational = spark.worlds.filter((item) => item.status === "operational").length;
  const backupReady = !security.backups_required || (backupState.enabled && !backupState.last_error);
  const managedDataReady = !security.managed_data_required || (managedDataState.configured && managedDataState.healthy !== false);
  const checks = [
    item("cyvx_runtime", cyvxStatus.status !== "error", 20, cyvxStatus.status),
    item("spark_runtime", sparkHealth.status === "ok", 20, sparkHealth.status),
    item("durable_state", Boolean(spark.updated_at), 10, spark.updated_at || "missing"),
    item("approval_governance", spark.capabilities.some((capability) => capability.requires_approval), 10, "bounded"),
    item("autonomy", autonomyState.enabled && autonomyState.scheduled, 10, autonomyState.enabled ? "scheduled" : "disabled"),
    item("observability", Boolean(spark.recent_events) && Boolean(telemetryState), 10, `${spark.recent_events.length} events; ${telemetryState.errors_total || 0} errors`),
    item("encrypted_backups", backupReady, 10, backupState.enabled ? (backupState.last_success_at || "scheduled") : "not-required"),
    item("managed_postgres", managedDataReady, 10, managedDataState.configured ? (managedDataState.healthy === false ? "unhealthy" : "configured") : "not-required"),
  ];
  return {
    powered_by: "Spark + CYVX",
    version: "7.1.0-production-baseline",
    generated_at: new Date().toISOString(),
    uptime_seconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
    readiness: readiness(checks),
    runtime: {
      cyvx: { healthy: cyvxStatus.status !== "error", status: cyvxStatus.status || "ok" },
      spark: { healthy: sparkHealth.status === "ok", status: sparkHealth.status, version: sparkHealth.version },
      github: normalizeGithub(github),
      autonomy: autonomyState,
      backup: backupState,
      managed_data: managedDataState,
      telemetry: telemetryState,
      security: sanitizeSecurity(security),
    },
    state: { pending, active, operational },
    metrics,
    recent_events: spark.recent_events.slice(0, 20),
    state_updated_at: spark.updated_at,
  };
}

function normalizeGithub(value) {
  return {
    ready: Boolean(value.ready),
    webhook_ready: Boolean(value.webhook_ready),
    app_auth_ready: Boolean(value.app_auth_ready),
    oauth_ready: Boolean(value.oauth_ready),
  };
}

function sanitizeSecurity(value) {
  return {
    ok: Boolean(value.ok),
    production: Boolean(value.production),
    managed_data_required: Boolean(value.managed_data_required),
    backups_required: Boolean(value.backups_required),
    failed: Array.isArray(value.failed) ? value.failed : [],
  };
}

function item(key, ok, weight, detail) { return { key, ok: Boolean(ok), weight, detail }; }
function safely(fn, fallback) { try { return fn(); } catch { return fallback; } }

module.exports = { runtimeSnapshot };
