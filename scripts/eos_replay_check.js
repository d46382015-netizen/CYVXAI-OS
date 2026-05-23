"use strict";

const assert = require("node:assert/strict");
const { createRecorder, instrument, replay } = require("../packages/eos-replay");

(async () => {
  const recorder = createRecorder({
    runId: "run_123",
    actor: "agent-x",
    host: "node-1",
  });

  const wrapped = instrument(async function addOne(value) {
    return value + 1;
  }, { recorder });

  const result = await wrapped(41);
  const snapshot = recorder.snapshot();
  const reconstructed = replay(snapshot.events);

  assert.equal(result, 42);
  assert.equal(snapshot.events.length, 2);
  assert.equal(reconstructed.state.last_return.result, 42);

  console.log("EOS replay package check passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
