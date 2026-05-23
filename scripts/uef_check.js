"use strict";

const assert = require("node:assert/strict");
const { createRecorder, replay } = require("../sdk");

const recorder = createRecorder({
  runId: "run_123",
  actor: "agent-x",
  host: "node-1",
});

const a = recorder.set("alpha", 1, { latency_ms: 12 });
const b = recorder.call({ name: "compute" }, { latency_ms: 4, caused_by: [a.id] });
recorder.ret({ ok: true }, { caused_by: [b.id] });
recorder.state("status", "done", { caused_by: [b.id] });

const result = replay(recorder.export());

assert.equal(result.state.alpha, 1);
assert.equal(result.state.status, "done");
assert.equal(result.causalEdges.length, 2);
assert.equal(result.events.length, 4);

console.log("UEF check passed.");
