"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { deliberate, snapshot } = require("../core/agency-runtime/autonomous_agency");

test("autonomous agency runs AEON council loop", () => {
  const session = deliberate({ goal: "Build a $10k/month autonomous agency" });
  assert.equal(session.kernel, "AEON Ω");
  assert.equal(session.perspectives.length, 5);
  assert.ok(session.mission.next_action);
  assert.ok(session.decision.selected_path);
  const state = snapshot();
  assert.equal(state.autonomous, true);
  assert.ok(state.memory_summary.sessions >= 1);
});
