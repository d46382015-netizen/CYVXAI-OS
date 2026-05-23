"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CyvxDatabase } = require("../db");
const { RaftCluster } = require("../core/tier1/raft");

function makeDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-raft-"));
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
    const cluster = new RaftCluster("node-a", [{ id: "node-b", reachable: true }], { persistence: db });

    cluster.log = [{
      index: 0,
      term: 3,
      type: "command",
      command: { type: "noop" },
      prevIndex: -1,
      prevTerm: 0,
      prevHash: null,
      hash: "manual-entry",
    }];
    cluster.commitIndex = 0;
    cluster.lastApplied = 0;
    cluster.persistState();

    const vote = cluster.requestVote({ candidateId: "node-c", term: 5, lastLogIndex: -1, lastLogTerm: 0 });
    assert.equal(vote.data.granted, false);
    assert.equal(db.loadRaftState().term, 5);

    const append = cluster.appendEntries({
      term: 6,
      leaderId: "node-b",
      prevLogIndex: 0,
      prevLogTerm: 2,
      entries: [],
      leaderCommit: 0,
    });
    assert.equal(append.data.accepted, false);
    assert.equal(db.loadRaftState().term, 6);
    assert.equal(db.loadRaftState().leaderId, "node-b");

    const reloaded = new RaftCluster("node-a", [{ id: "node-b", reachable: true }], { persistence: new CyvxDatabase(target.file) });
    assert.equal(reloaded.term, 6);
    assert.equal(reloaded.leaderId, "node-b");
    assert.equal(reloaded.commitIndex, 0);
    assert.equal(reloaded.lastApplied, 0);

    console.log("raft recovery check passed");
  } finally {
    cleanup(target);
  }
}

main();
