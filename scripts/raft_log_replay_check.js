"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CyvxDatabase } = require("../db");
const { RaftCluster } = require("../core/tier1/raft");

function makeDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-raft-replay-"));
  return {
    dir,
    file: path.join(dir, "raft.db"),
  };
}

function cleanup(target) {
  fs.rmSync(target.dir, { recursive: true, force: true });
}

function main() {
  const target = makeDb();
  try {
    const db = new CyvxDatabase(target.file);
    const cluster = new RaftCluster("node-a", [], { persistence: db });

    const first = cluster.propose({
      type: "workload:create",
      payload: { id: "workload-1", name: "alpha", cpu_request: 2, replicas: 1 },
    });
    assert.equal(first.data.committed, true);

    const second = cluster.propose({
      type: "action",
      payload: { type: "scale_up", workload_id: "workload-1", replicas: 3 },
    });
    assert.equal(second.data.committed, true);

    const replayed = cluster.replayFromLog();
    assert.deepEqual(replayed, cluster.machineState);

    const snapshot = cluster.snapshot().data.snapshot;
    assert.deepEqual(snapshot.machineState, cluster.machineState);

    const corruptedLog = [...cluster.log, {
      index: 99,
      term: cluster.term,
      type: "command",
      command: { type: "action", payload: { type: "corrupt" } },
      prevIndex: 17,
      prevTerm: 1,
      prevHash: "deadbeef",
      hash: "corrupt-entry",
      metadata: {},
      timestamp: new Date().toISOString(),
    }];
    db.saveRaftState(cluster.state());
    db.saveRaftLog(corruptedLog);
    db.saveRaftSnapshot(snapshot);

    const reloaded = new RaftCluster("node-a", [], { persistence: new CyvxDatabase(target.file) });
    assert.equal(reloaded.log.length, cluster.log.length);
    assert.equal(reloaded.commitIndex, cluster.commitIndex);
    assert.equal(reloaded.lastApplied, cluster.lastApplied);
    assert.deepEqual(reloaded.replayFromLog(), reloaded.machineState);
    assert.deepEqual(reloaded.machineState, cluster.machineState);

    console.log("raft log replay check passed");
  } finally {
    cleanup(target);
  }
}

main();
