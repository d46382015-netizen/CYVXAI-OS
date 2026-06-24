"use strict";

const { runtimeSnapshot } = require("./runtime_snapshot");
const { nextActions, operatingState } = require("./next_actions");

function buildOverview(options) {
  const snapshot = runtimeSnapshot(options);
  const state = snapshot.state;
  const metrics = snapshot.metrics;
  return {
    powered_by: snapshot.powered_by,
    version: snapshot.version,
    generated_at: snapshot.generated_at,
    uptime_seconds: snapshot.uptime_seconds,
    operating_state: operatingState({ pending: state.pending, active: state.active, operational: state.operational, metrics }),
    readiness: snapshot.readiness,
    runtime: snapshot.runtime,
    traction: { ...metrics, pending_approvals: state.pending, active_sparks: state.active, operational_worlds: state.operational },
    proof: { recent_events: snapshot.recent_events, state_updated_at: snapshot.state_updated_at },
    next_actions: nextActions({
      pending: state.pending,
      active: state.active,
      operational: state.operational,
      metrics,
      autonomy: snapshot.runtime.autonomy,
    }),
  };
}

module.exports = { buildOverview };
