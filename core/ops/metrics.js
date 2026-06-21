"use strict";

function renderMetrics(overview) {
  const traction = overview.traction || {};
  const autonomy = overview.runtime?.autonomy?.metrics || {};
  return [
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
    "",
  ].join("\n");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = { renderMetrics };
