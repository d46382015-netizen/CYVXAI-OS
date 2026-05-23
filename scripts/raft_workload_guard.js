"use strict";

global.__RAFT_METRICS__ = global.__RAFT_METRICS__ || {
  writeCount: 0,
  commitCount: 0,
  maxCommitIndex: -1,
};

function recordWrite() {
  global.__RAFT_METRICS__.writeCount += 1;
}

function recordCommit(index) {
  global.__RAFT_METRICS__.commitCount += 1;
  if (index > global.__RAFT_METRICS__.maxCommitIndex) {
    global.__RAFT_METRICS__.maxCommitIndex = index;
  }
}

function validateFinalRun() {
  const metrics = global.__RAFT_METRICS__;
  if (metrics.maxCommitIndex <= 0) {
    throw new Error("[WORKLOAD-FAIL] No committed entries observed (invalid Raft run)");
  }
  if (metrics.writeCount < 10) {
    throw new Error("[WORKLOAD-FAIL] Insufficient write pressure (system not exercised)");
  }
  if (metrics.commitCount === 0) {
    throw new Error("[WORKLOAD-FAIL] No commits achieved despite workload");
  }
  return true;
}

function startWorkload(proposeFn, intervalMs = 100) {
  let seq = 0;
  const timer = setInterval(() => {
    const value = {
      seq,
      payload: Math.random().toString(36).slice(2),
    };
    seq += 1;
    recordWrite();
    try {
      proposeFn(value);
    } catch {
      // keep pressure alive under transient leader loss
    }
  }, Math.max(10, Number(intervalMs) || 100));
  timer.unref?.();
  return timer;
}

function metricsSnapshot() {
  return { ...global.__RAFT_METRICS__ };
}

module.exports = {
  recordWrite,
  recordCommit,
  validateFinalRun,
  startWorkload,
  metricsSnapshot,
};
