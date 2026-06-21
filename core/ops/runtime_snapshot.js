"use strict";

const { readiness } = require("./readiness");

function runtimeSnapshot({ sparkRuntime, autonomy, cyvx, github = {}, startedAt = Date.now() }) {
  const spark = sparkRuntime.snapshot();
  const metrics = spark.metrics || {};
  const sparkHealth = safely(() => sparkRuntime.health(), { status: "error" });
  const cyvxStatus = safely(() => cyvx.controller.status(), { status: "error" });
  const autonomyState = autonomy.snapshot();
  const pending = spark.sparks.filter((item) => item.status === "awaiting_approval").length;
  const active = spark.sparks.filter((item) => item.status === "active").length;
  const operational = spark.worlds.filter((item) => item.status === "operational").length;
  const checks = [
    item("cyvx_runtime", cyvxStatus.status !== "error", 25, cyvxStatus.status),
    item("spark_runtime", sparkHealth.status === "ok", 25, sparkHealth.status),
    item("durable_state", Boolean(spark.updated_at), 10, spark.updated_at || "missing"),
    item("approval_governance", spark.capabilities.some((capability) => capability.requires_approval), 10, "bounded"),
    item("autonomy", autonomyState.enabled && autonomyState.scheduled, 15, autonomyState.enabled ? "scheduled" : "disabled"),
    item("observability", Boolean(spark.recent_events), 15, `${spark.recent_events.length} events`),
  ];
  return {
    powered_by: "Spark + CYVX",
    version: "7.0.0-control-plane",
    generated_at: new Date().toISOString(),
    uptime_seconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
    readiness: readiness(checks),
    runtime: {
      cyvx: { healthy: cyvxStatus.status !== "error", status: cyvxStatus.status || "ok" },
      spark: { healthy: sparkHealth.status === "ok", status: sparkHealth.status, version: sparkHealth.version },
      github: normalizeGithub(github),
      autonomy: autonomyState,
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

function item(key, ok, weight, detail) { return { key, ok: Boolean(ok), weight, detail }; }
function safely(fn, fallback) { try { return fn(); } catch { return fallback; } }

module.exports = { runtimeSnapshot };
