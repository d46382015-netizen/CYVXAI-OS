"use strict";

const assert = require("node:assert/strict");
const { RaftCluster } = require("../core/tier1/raft");

const NODES = ["node-a", "node-b", "node-c"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createCluster(nodeId) {
  const peers = NODES.map((id) => ({ id, reachable: true }));
  const cluster = new RaftCluster(nodeId, peers);
  cluster.membership.voters = [...NODES];
  return cluster;
}

function leaderSync(leader, follower) {
  const divergenceIndex = findDivergenceIndex(leader, follower);
  const previous = divergenceIndex > 0 ? leader.log[divergenceIndex - 1] : null;
  const entries = leader.log.slice(divergenceIndex).map((entry) => clone(entry));
  return follower.appendEntries({
    term: leader.term,
    leaderId: leader.nodeId,
    prevLogIndex: previous ? previous.index : -1,
    prevLogTerm: previous ? previous.term : 0,
    leaderCommit: leader.commitIndex,
    entries,
  });
}

function findDivergenceIndex(leader, follower) {
  const max = Math.min(leader.log.length, follower.log.length);
  for (let index = 0; index < max; index += 1) {
    if (leader.log[index].hash !== follower.log[index].hash) {
      return index;
    }
  }
  return max;
}

function assertSingleLeader(nodes) {
  const leaders = nodes.filter((node) => node.role === "leader");
  assert.equal(leaders.length, 1, "exactly one leader expected");
  return leaders[0];
}

function assertConsensus(nodes) {
  const leader = assertSingleLeader(nodes);
  for (const node of nodes) {
    if (node.nodeId !== leader.nodeId) {
      assert.equal(node.leaderId, leader.nodeId);
    }
  }
  return leader;
}

function main() {
  const nodes = NODES.map(createCluster);
  const [a, b, c] = nodes;

  const election = a.leaderElection();
  assert.equal(election.data.elected, true);
  assertSingleLeader(nodes);

  const first = a.propose({
    type: "workload:create",
    payload: { id: "workload-1", name: "alpha", cpu_request: 2, replicas: 1 },
  }, { ackCount: 2 });
  assert.equal(first.data.committed, true);

  const replicateB1 = leaderSync(a, b);
  assert.equal(replicateB1.data.accepted, true);
  assert.deepEqual(b.machineState, a.machineState);
  assert.equal(b.commitIndex, a.commitIndex);

  c.log = [{
    index: 0,
    term: a.term,
    type: "command",
    command: { type: "workload:create", payload: { id: "rogue", name: "split-brain" } },
    prevIndex: -1,
    prevTerm: 0,
    prevHash: null,
    metadata: {},
    timestamp: new Date().toISOString(),
    hash: "rogue-entry",
  }];
  c.commitIndex = -1;
  c.lastApplied = -1;
  c.machineState = {
    version: 1,
    lastApplied: 0,
    term: a.term,
    leaderId: "node-c",
    data: { workloads: [{ id: "rogue", name: "split-brain" }] },
  };

  const replicateC1 = leaderSync(a, c);
  assert.equal(replicateC1.data.accepted, true);
  assert.deepEqual(c.machineState, a.machineState);
  assert.equal(c.log.length, a.log.length);
  assert.equal(findDivergenceIndex(a, c), a.log.length);

  const second = a.propose({
    type: "action",
    payload: { type: "scale_up", workload_id: "workload-1", replicas: 3 },
  }, { ackCount: 2 });
  assert.equal(second.data.committed, true);

  leaderSync(a, b);
  assert.deepEqual(b.machineState, a.machineState);
  assert.equal(b.commitIndex, a.commitIndex);

  assert.equal(c.commitIndex, 0, "partitioned follower should remain behind before catch-up");
  leaderSync(a, c);
  assert.deepEqual(c.machineState, a.machineState);
  assert.equal(c.commitIndex, a.commitIndex);

  for (const node of nodes) {
    assert.deepEqual(node.replayFromLog(), node.machineState);
  }

  assertConsensus(nodes);
  console.log("raft three-node harness passed");
}

main();
