"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { agentOsSnapshot } = require("../core/agent-os/agent_runtime");

test("Agent OS exposes live agency operators", () => {
  const snapshot = agentOsSnapshot();
  assert.equal(snapshot.primitive, "Agency");
  assert.ok(Array.isArray(snapshot.agents));
  assert.ok(snapshot.agents.length >= 5);
  assert.ok(snapshot.agents.find(a => a.name === "Commander"));
  assert.ok(snapshot.system_next_action);
});
