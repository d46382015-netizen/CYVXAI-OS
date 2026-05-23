/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
"use strict";

const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { response } = require("../shared/attribution");

class RaftCluster extends EventEmitter {
  constructor(nodeId, peers = []) {
    super();
    this.nodeId = nodeId;
    this.peers = new Map(peers.map((peer) => [peer.id, peer]));
    this.term = 0;
    this.votedFor = null;
    this.log = [];
    this.commitIndex = -1;
    this.role = "follower";
    this.snapshotData = null;
    this.observability = [];
  }

  leaderElection() {
    this.term += 1;
    this.role = "leader";
    this.votedFor = this.nodeId;
    return response("raft-election", { leader: this.nodeId, term: this.term, quorum: this.quorum() });
  }

  quorum() {
    return Math.floor((this.peers.size + 1) / 2) + 1;
  }

  append(entry) {
    const record = { index: this.log.length, term: this.term, entry, hash: hash(JSON.stringify(entry) + this.term) };
    this.log.push(record);
    return response("raft-append", { record });
  }

  commit(index = this.log.length - 1) {
    this.commitIndex = Math.max(this.commitIndex, index);
    return response("raft-commit", { commitIndex: this.commitIndex });
  }

  membershipChanges(change) {
    if (change.action === "add") this.peers.set(change.peer.id, change.peer);
    if (change.action === "remove") this.peers.delete(change.peer.id);
    return response("raft-membership", { peers: [...this.peers.values()] });
  }

  snapshot() {
    this.snapshotData = {
      term: this.term,
      commitIndex: this.commitIndex,
      logLength: this.log.length,
      checksum: hash(JSON.stringify(this.log)),
    };
    return response("raft-snapshot", { snapshot: this.snapshotData });
  }

  crashReplay(snapshot = this.snapshotData) {
    if (!snapshot) return response("raft-replay", { replayed: false });
    this.term = snapshot.term;
    this.commitIndex = snapshot.commitIndex;
    return response("raft-replay", { replayed: true, snapshot });
  }

  partitionTolerance(view = []) {
    const reachable = view.filter((peer) => peer.reachable !== false).length + 1;
    return response("partition-tolerance", { reachable, quorum: this.quorum(), tolerated: reachable >= this.quorum() });
  }

  multiRaftSupport(groups = []) {
    return response("multi-raft", {
      groups: groups.map((group) => group.id || crypto.randomUUID()),
      supported: true,
    });
  }

  electionStabilityTuning(metrics = []) {
    const instability = metrics.reduce((sum, metric) => sum + Number(metric.flaps || 0), 0);
    return response("raft-stability", { instability, stable: instability < 3 });
  }

  observabilityRecord(event) {
    this.observability.push({ event, at: new Date().toISOString() });
    return response("raft-observability", { recorded: true, count: this.observability.length });
  }
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = {
  RaftCluster,
};
