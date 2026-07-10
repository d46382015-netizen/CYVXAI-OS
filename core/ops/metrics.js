"use strict";

function renderMetrics(overview) {
  const traction = overview.traction || {};
  const runtime = overview.runtime || {};
  const autonomy = runtime.autonomy?.metrics || {};
  const backup = runtime.backup || {};
  const managed = runtime.managed_data || {};
  const telemetry = runtime.telemetry || {};
  return [
    "# HELP cyvx_readiness_score Weighted production readiness score.",
    "# TYPE cyvx_readiness_score gauge",
    `cyvx_readiness_score ${number(overview.readiness?.score)}`,
    "# TYPE cyvx_sparks_total gauge",
    `cyvx_sparks_total ${number(traction.sparks_total)}`,
    "# TYPE cyvx_active_sparks gauge",
    `cyvx_active_sparks ${number(traction.active_sparks)}`,
    "# TYPE cyvx_pending_approvals gauge",
    `cyvx_pending_approvals ${number(traction.pending_approvals)}`,
    "# TYPE cyvx_operational_worlds gauge",
    `cyvx_operational_worlds ${number(traction.operational_worlds)}`,
    "# TYPE cyvx_leads_total counter",
    `cyvx_leads_total ${number(traction.leads_total)}`,
    "# TYPE cyvx_verified_outcomes_total counter",
    `cyvx_verified_outcomes_total ${number(traction.verified_outcomes)}`,
    "# TYPE cyvx_verified_value_cents counter",
    `cyvx_verified_value_cents ${number(traction.verified_value_cents)}`,
    "# TYPE cyvx_autonomy_executions_total counter",
    `cyvx_autonomy_executions_total ${number(autonomy.executions)}`,
    "# TYPE cyvx_autonomy_failures_total counter",
    `cyvx_autonomy_failures_total ${number(autonomy.failures)}`,
    "# HELP cyvx_errors_total Structured runtime errors captured by CYVX telemetry.",
    "# TYPE cyvx_errors_total counter",
    `cyvx_errors_total ${number(telemetry.errors_total)}`,
    "# HELP cyvx_backup_enabled Whether encrypted backups are enabled.",
    "# TYPE cyvx_backup_enabled gauge",
    `cyvx_backup_enabled ${backup.enabled ? 1 : 0}`,
    "# HELP cyvx_backup_last_success_timestamp_seconds Unix timestamp of the last successful backup.",
    "# TYPE cyvx_backup_last_success_timestamp_seconds gauge",
    `cyvx_backup_last_success_timestamp_seconds ${timestamp(backup.last_success_at)}`,
    "# TYPE cyvx_backup_failures_total counter",
    `cyvx_backup_failures_total ${number(telemetry.counters?.backup_failures_total || backup.consecutive_failures)}`,
    "# TYPE cyvx_backup_last_size_bytes gauge",
    `cyvx_backup_last_size_bytes ${number(backup.last_backup?.backup_bytes || telemetry.gauges?.backup_last_size_bytes)}`,
    "# HELP cyvx_managed_data_healthy Whether managed PostgreSQL synchronization is healthy.",
    "# TYPE cyvx_managed_data_healthy gauge",
    `cyvx_managed_data_healthy ${managed.configured && managed.healthy !== false ? 1 : 0}`,
    "# TYPE cyvx_managed_data_sync_total counter",
    `cyvx_managed_data_sync_total ${number(managed.sync_total)}`,
    "# TYPE cyvx_managed_data_failure_total counter",
    `cyvx_managed_data_failure_total ${number(managed.failure_total)}`,
    "# TYPE cyvx_uptime_seconds gauge",
    `cyvx_uptime_seconds ${number(overview.uptime_seconds)}`,
    "",
  ].join("\n");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestamp(value) {
  const parsed = Date.parse(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed / 1000) : 0;
}

module.exports = { renderMetrics };
