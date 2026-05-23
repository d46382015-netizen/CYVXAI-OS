"use strict";

const assert = require("node:assert/strict");
const {
  bootstrapEIP,
  buildCausalEdges,
  minimalCauseChain,
  EIP_POLICY,
} = require("../core/eip");

const eip = bootstrapEIP({});

eip.appendEvent({ id: "event-1", type: "SET", key: "alpha", value: 1 });
eip.appendEvent({ id: "event-2", type: "SET", key: "beta", value: 2 });

const replayed = eip.replay();
const snapshot = eip.snapshot();
const causalEdges = buildCausalEdges(snapshot.events);
const causeChain = minimalCauseChain(snapshot.events, "event-2");

assert.equal(replayed.alpha, 1);
assert.equal(replayed.beta, 2);
assert.equal(snapshot.events.length, 2);
assert.equal(causalEdges.length, 1);
assert.equal(causeChain.length, 2);
assert.equal(EIP_POLICY.requireReplayAsTruth, true);

console.log("EIP consolidation check passed.");
