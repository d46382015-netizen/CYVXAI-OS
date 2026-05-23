"use strict";

const crypto = require("node:crypto");

global.__RAFT_EVENT_LOG__ = global.__RAFT_EVENT_LOG__ || [];

function emit(event) {
  global.__RAFT_EVENT_LOG__.push({
    ...event,
    ts: Date.now(),
  });
}

function extractStateHash(state) {
  const app = state?.machineState?.data;
  if (!app) {
    throw new Error("Invariant violation: missing application state");
  }

  return crypto.createHash("sha256")
    .update(JSON.stringify({
      commitIndex: state?.commitIndex,
      lastApplied: state?.lastApplied,
      data: app,
    }))
    .digest("hex");
}

function checkLinearizability() {
  const log = global.__RAFT_EVENT_LOG__ || [];
  const commits = log.filter((event) => event.type === "commit").sort((a, b) => a.ts - b.ts);

  let lastIndex = -1;
  const seen = new Map();

  for (const op of commits) {
    if (op.index < lastIndex) {
      throw new Error("Linearizability violation: out-of-order commit");
    }
    lastIndex = op.index;

    if (seen.has(op.index) && seen.get(op.index) !== op.value) {
      throw new Error(`Safety violation: index ${op.index} has conflicting values`);
    }

    seen.set(op.index, op.value);
  }

  return true;
}

module.exports = {
  emit,
  extractStateHash,
  checkLinearizability,
};
