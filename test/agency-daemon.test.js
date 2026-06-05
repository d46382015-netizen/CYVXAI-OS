"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { tick } = require("../core/agency-daemon/daemon");

test("agency daemon tick creates persistent autonomous state", () => {
  const state = tick({ goal: "Improve CYVX autonomous agency runtime" });
  assert.equal(state.status, "running");
  assert.ok(state.latest_mission.next_action);
  assert.ok(fs.existsSync("data/agency-daemon/state.json"));
  assert.ok(fs.existsSync("logs/agency-daemon.log"));
});
