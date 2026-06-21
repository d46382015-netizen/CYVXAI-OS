"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { AutonomySupervisor } = require("../core/production/autonomy_supervisor");

test("supervisor runs approved active work only", async () => {
  const calls = [];
  const runtime = {
    listSparks: () => [
      { id: "approved", owner_id: "owner-1", status: "active", active_mission_id: "mission-1" },
      { id: "blocked", owner_id: "owner-2", status: "active", active_mission_id: "mission-2" },
      { id: "paused", owner_id: "owner-3", status: "paused", active_mission_id: "mission-3" },
    ],
    graph: (id) => id === "approved"
      ? { approvals: [{ status: "approved" }], mission: { status: "active" } }
      : { approvals: [{ status: "pending" }], mission: { status: "active" } },
    execute: (id, input) => calls.push({ id, input }),
  };
  const supervisor = new AutonomySupervisor({ runtime, enabled: true, logger: () => {} });
  await supervisor.tick();
  assert.deepEqual(calls, [{ id: "approved", input: { owner_id: "owner-1", max_steps: 20 } }]);
  assert.equal(supervisor.snapshot().metrics.executions, 1);
  assert.equal(supervisor.snapshot().metrics.skipped, 1);
});

test("disabled supervisor does not inspect work", async () => {
  const runtime = { listSparks: () => { throw new Error("must not run"); } };
  const supervisor = new AutonomySupervisor({ runtime, enabled: false, logger: () => {} });
  await supervisor.tick();
  assert.equal(supervisor.snapshot().metrics.ticks, 0);
});
