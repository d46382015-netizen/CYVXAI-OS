"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildOverview } = require("../core/ops/overview");

function fixture() {
  const state = {
    metrics: { sparks_total: 1, active_sparks: 0, operational_worlds: 1, leads_total: 0, queued_followups: 0, verified_outcomes: 0 },
    sparks: [{ id: "spark-1", status: "awaiting_approval" }],
    worlds: [{ id: "world-1", status: "operational" }],
    capabilities: [{ key: "execute", requires_approval: true }],
    recent_events: [{ event: "spark.ignited" }],
    updated_at: new Date().toISOString(),
  };
  return {
    sparkRuntime: {
      snapshot: () => state,
      health: () => ({ status: "ok", version: 1 }),
    },
    autonomy: { snapshot: () => ({ enabled: true, scheduled: true, metrics: { executions: 0, failures: 0 } }) },
    cyvx: { controller: { status: () => ({ status: "ok" }) } },
    github: { ready: true, webhook_ready: true, app_auth_ready: true, oauth_ready: true },
    startedAt: Date.now() - 5000,
  };
}

test("overview combines readiness, traction and next action", () => {
  const overview = buildOverview(fixture());
  assert.equal(overview.readiness.score, 100);
  assert.equal(overview.readiness.grade, "production");
  assert.equal(overview.operating_state, "awaiting_approval");
  assert.equal(overview.traction.pending_approvals, 1);
  assert.equal(overview.next_actions[0].key, "approve");
  assert.ok(overview.uptime_seconds >= 5);
});

test("readiness degrades when a core runtime fails", () => {
  const options = fixture();
  options.cyvx.controller.status = () => ({ status: "error" });
  const overview = buildOverview(options);
  assert.equal(overview.readiness.score, 75);
  assert.equal(overview.readiness.grade, "ready");
  assert.equal(overview.runtime.cyvx.healthy, false);
});
