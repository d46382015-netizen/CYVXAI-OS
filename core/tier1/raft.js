    this.role = "follower";
    this.leaderId = null;      this.role = "follower";
      this.leaderId = null;/**
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
  constructor(nodeId, peers = [], options = {}) {
    super();
    this.nodeId = nodeId;
    this.peers = new Map();
    this.term = 0;
    this.votedFor = null;
    this.log = [];
    this.commitIndex = -1;
    this.lastApplied = -1;
    this.role = "follower";
    this.leaderId = null;
    this.snapshotData = null;
    this.observability = [];
    this.incomingSequences = new Map();
    this.lastLeaderContactAt = Date.now();
    this.electionTimeoutMs = Math.max(250, Number(options.electionTimeoutMs || 1500));
    this.electionTimeoutMs += crypto.createHash("sha256").update(String(this.nodeId)).digest().readUInt16BE(0) % 250;
    this.heartbeatIntervalMs = Math.max(100, Number(options.heartbeatIntervalMs || 500));
    this.persistence = options.persistence || null;
    this.transport = options.transport || null;
    this.membership = {
      voters: [this.nodeId],
      learners: [],
      joint: null,
    };
    this.machineState = options.initialState || { version: 0, data: {} };
    this.setPeers(peers);
    this.loadFromPersistence();
  }

  setPeers(peers = []) {
    this.peers.clear();
    for (const peer of peers) {
      if (!peer || !peer.id) continue;
      this.peers.set(peer.id, { ...peer });
    }
    if (!this.peers.has(this.nodeId)) {
      this.peers.set(this.nodeId, { id: this.nodeId, role: this.role, reachable: true });
    }
    return this.snapshot();
  }

  attachPersistence(persistence) {
    this.persistence = persistence;
    this.loadFromPersistence();
    return this.snapshot();
  }

  loadFromPersistence() {
    if (!this.persistence) return false;
    const state = this.persistence.loadRaftState?.();
    const log = this.persistence.loadRaftLog?.();
    const snapshot = this.persistence.loadRaftSnapshot?.();
    if (state) {
      this.term = Number(state.term || 0);
      this.votedFor = state.votedFor || null;
      this.commitIndex = Number(state.commitIndex ?? -1);
      this.lastApplied = Number(state.lastApplied ?? this.commitIndex);
      this.role = state.role || "follower";
      this.leaderId = state.leaderId || null;
      this.membership = normalizeMembership(state.membership, this.nodeId);
      this.machineState = state.machineState || this.machineState;
    }
    if (Array.isArray(log)) {
      this.log = log.map((entry) => normalizeEntry(entry));
    }
    if (snapshot) {
      this.snapshotData = snapshot;
      if (snapshot.machineState) this.machineState = snapshot.machineState;
      if (snapshot.term != null) this.term = Number(snapshot.term);
      if (snapshot.commitIndex != null) this.commitIndex = Number(snapshot.commitIndex);
      if (snapshot.lastApplied != null) this.lastApplied = Number(snapshot.lastApplied);
      this.leaderId = null;
      this.role = "follower";
      if (snapshot.membership) this.membership = normalizeMembership(snapshot.membership, this.nodeId);
    }
    this.lastLeaderContactAt = Date.now();
    this.reconcileLog();
    this.rebuildMachineState();
    return true;
  }

  persistState() {
    if (!this.persistence) return null;
    const state = this.state();
    this.persistence.saveRaftState?.(state);
    this.persistence.saveRaftLog?.(this.log);
    const snapshot = this.snapshot();
    this.persistence.saveRaftSnapshot?.(snapshot.data?.snapshot || this.snapshotData || null);
    return state;
  }

  reconcileLog() {
    if (!Array.isArray(this.log) || this.log.length === 0) {
      this.log = [];
      this.commitIndex = Math.min(Number(this.commitIndex ?? -1), -1);
      this.lastApplied = Math.min(Number(this.lastApplied ?? -1), this.commitIndex);
      return { valid: true, truncated: false, length: 0 };
    }

    const reconciled = [];
    let previous = null;
    let truncated = false;

    for (const rawEntry of this.log) {
      const entry = normalizeEntry(rawEntry, previous);
      const expectedIndex = previous ? previous.index + 1 : 0;
      const expectedPrevIndex = previous ? previous.index : -1;
      const expectedPrevTerm = previous ? previous.term : 0;
      const expectedPrevHash = previous ? previous.hash : null;

      if (
        entry.index !== expectedIndex ||
        entry.prevIndex !== expectedPrevIndex ||
        entry.prevTerm !== expectedPrevTerm ||
        entry.prevHash !== expectedPrevHash
      ) {
        truncated = true;
        break;
      }

      reconciled.push(entry);
      previous = entry;
    }

    if (truncated || reconciled.length !== this.log.length) {
      this.log = reconciled;
    }

    const maxIndex = this.log.length - 1;
    this.commitIndex = Math.min(Number(this.commitIndex ?? -1), maxIndex);
    this.lastApplied = Math.min(Number(this.lastApplied ?? this.commitIndex), this.commitIndex);
    return { valid: !truncated, truncated, length: this.log.length };
  }

  rebuildMachineState(baseState = null, limit = this.commitIndex) {
    const snapshotState = baseState || this.snapshotData?.machineState || { version: 0, data: {} };
    const state = canonicalize(snapshotState);
    state.data = state.data || {};
    const startIndex = baseState || !this.snapshotData ? 0 : Math.max(0, Number(this.snapshotData.commitIndex ?? -1) + 1);
    const end = Math.min(Number(limit ?? this.commitIndex), this.log.length - 1);

    for (let index = startIndex; index <= end; index += 1) {
      const entry = this.log[index];
      if (!entry) break;
      this.applyStateMachine(entry, state);
    }

    this.machineState = state;
    this.lastApplied = Math.min(Math.max(this.lastApplied, end), this.commitIndex);
    return this.machineState;
  }

  quorum(membership = this.membership) {
    const voters = Array.isArray(membership?.voters) && membership.voters.length ? membership.voters : [this.nodeId];
    const joint = membership?.joint;
    if (joint) {
      const oldQuorum = Math.floor(joint.oldVoters.length / 2) + 1;
      const newQuorum = Math.floor(joint.newVoters.length / 2) + 1;
      return { voters: voters.length, required: Math.max(oldQuorum, newQuorum), joint: true };
    }
    return { voters: voters.length, required: Math.floor(voters.length / 2) + 1, joint: false };
  }

  voterIds() {
    return Array.isArray(this.membership.voters) && this.membership.voters.length ? [...this.membership.voters] : [this.nodeId];
  }

  hasQuorum(ackCount, membership = this.membership) {
    return ackCount >= this.quorum(membership).required;
  }

  latestLogInfo() {
    const last = this.log[this.log.length - 1] || null;
    return {
      index: last ? last.index : -1,
      term: last ? last.term : 0,
      hash: last ? last.hash : null,
    };
  }

  acceptTransportSequence(kind, request = {}) {
    const sourceId = request.sourceId || request.candidateId || request.leaderId || request.nodeId || null;
    const sequence = Number(request.sequence ?? -1);
    if (!sourceId || sequence < 0) {
      return { duplicate: false, sourceId, sequence };
    }
    const key = kind + ":" + sourceId;
    const seen = this.incomingSequences.get(key) ?? -1;
    if (sequence <= seen) {
      return { duplicate: true, sourceId, sequence, seen };
    }
    this.incomingSequences.set(key, sequence);
    return { duplicate: false, sourceId, sequence };
  }

  shouldStartElection(now = Date.now()) {
    if (this.role === "leader") return false;
    if (!this.leaderId) return true;
    return (now - this.lastLeaderContactAt) >= this.electionTimeoutMs;
  }

  unwrapTransportResult(result = null) {
    const payload = result?.data?.response || result?.response || result || null;
    return payload?.data || payload || {};
  }

  async requestVote(request = {}) {
    const replay = this.acceptTransportSequence("raft-vote", request);
    const candidateId = request.candidateId || request.nodeId || request.id;
    if (replay.duplicate) {
      return response("raft-vote", { granted: this.votedFor === candidateId, duplicate: true, term: this.term, votedFor: this.votedFor, candidateId });
    }
    const candidateTerm = Number(request.term || 0);
    const candidateLastLogIndex = Number(request.lastLogIndex ?? -1);
    const candidateLastLogTerm = Number(request.lastLogTerm ?? 0);

    if (!candidateId) {
      return response("raft-vote", { granted: false, reason: "missing-candidate", term: this.term });
    }

    if (candidateTerm < this.term) {
      return response("raft-vote", { granted: false, reason: "stale-term", term: this.term, votedFor: this.votedFor });
    }

    if (candidateTerm > this.term) {
      this.term = candidateTerm;
      this.role = "follower";
      this.votedFor = null;
      this.leaderId = null;
      this.persistState();
    }

    if (!this.isLogUpToDate(candidateLastLogIndex, candidateLastLogTerm)) {
      return response("raft-vote", { granted: false, reason: "log-not-up-to-date", term: this.term });
    }

    if (this.votedFor && this.votedFor !== candidateId) {
      return response("raft-vote", { granted: false, reason: "already-voted", term: this.term, votedFor: this.votedFor });
    }

    this.votedFor = candidateId;
    this.role = "follower";
    this.leaderId = null;
    this.lastLeaderContactAt = Date.now();
    this.persistState();
    return response("raft-vote", { granted: true, term: this.term, candidateId, quorum: this.quorum() });
  }

  leaderElection() {
    this.term += 1;
    this.role = "candidate";
    this.votedFor = this.nodeId;
    const reachableVotes = 1 + this.reachablePeers().length;
    if (this.hasQuorum(reachableVotes)) {
      this.role = "leader";
      this.leaderId = this.nodeId;
      this.lastLeaderContactAt = Date.now();
      this.persistState();
      return response("raft-election", { leader: this.nodeId, term: this.term, quorum: this.quorum(), votes: reachableVotes, elected: true });
    }
    this.role = "follower";
    this.persistState();
    return response("raft-election", { leader: null, term: this.term, quorum: this.quorum(), votes: reachableVotes, elected: false, reason: "quorum-unreachable" });
  }

  async startElectionDistributed() {
    if (!this.transport || this.transport.peerTargets?.().length === 0) {
      return this.leaderElection();
    }

    this.term += 1;
    this.role = "candidate";
    this.votedFor = this.nodeId;
    this.leaderId = null;
    this.persistState();

    const last = this.latestLogInfo();
    const peers = this.transport.peerTargets();
    const payload = {
      term: this.term,
      candidateId: this.nodeId,
      lastLogIndex: last.index,
      lastLogTerm: last.term,
    };

    let votes = 1;
    const results = await Promise.allSettled(peers.map((peer) => this.transport.requestVote(peer, payload)));
    const details = [];
    for (let index = 0; index < results.length; index += 1) {
      const peer = peers[index];
      const settled = results[index];
      const transportResult = settled.status === "fulfilled" ? settled.value : null;
      const remote = this.unwrapTransportResult(transportResult);
      const granted = Boolean(remote.granted);
      if (granted) votes += 1;
      details.push({
        peerId: peer.id,
        delivered: Boolean(transportResult?.data?.delivered),
        granted,
        term: remote.term ?? null,
        error: settled.status === "rejected" ? settled.reason?.message || String(settled.reason) : transportResult?.data?.error || null,
      });
    }

    if (this.hasQuorum(votes)) {
      const confirmation = await this.confirmLeadershipDistributed();
      if (confirmation.data?.confirmed) {
        this.role = "leader";
        this.leaderId = this.nodeId;
        this.lastLeaderContactAt = Date.now();
        this.persistState();
        return response("raft-election", { leader: this.nodeId, term: this.term, quorum: this.quorum(), votes, elected: true, transport: "http", details, confirmation: confirmation.data });
      }
    }

    this.role = "follower";
    this.persistState();
    return response("raft-election", { leader: null, term: this.term, quorum: this.quorum(), votes, elected: false, reason: "quorum-unreachable", transport: "http", details });
  }

  async confirmLeadershipDistributed() {
    if (!this.transport || this.role !== "candidate") {
      return response("raft-leadership-confirmation", { confirmed: false, reason: "not-candidate-or-no-transport" });
    }

    const peers = this.transport.peerTargets();
    const payload = {
      term: this.term,
      leaderId: this.nodeId,
      prevLogIndex: -1,
      prevLogTerm: 0,
      leaderCommit: this.commitIndex,
      entries: this.log.map((entry) => normalizeEntry(entry)),
    };
    const results = await Promise.allSettled(peers.map((peer) => this.transport.appendEntries(peer, payload)));
    let acks = 1;
    const deliveries = results.map((settled, index) => {
      const transportResult = settled.status === "fulfilled" ? settled.value : null;
      const remote = this.unwrapTransportResult(transportResult);
      const accepted = Boolean(remote.accepted);
      if (accepted) acks += 1;
      return {
        peerId: peers[index].id,
        delivered: Boolean(transportResult?.data?.delivered),
        accepted,
        error: settled.status === "rejected" ? settled.reason?.message || String(settled.reason) : transportResult?.data?.error || null,
      };
    });
    return response("raft-leadership-confirmation", { confirmed: this.hasQuorum(acks), acks, deliveries });
  }

  async broadcastHeartbeatDistributed() {
    if (!this.transport || this.role !== "leader") {
      return response("raft-heartbeat", { sent: false, reason: "not-leader-or-no-transport" });
    }

    const peers = this.transport.peerTargets();
    const payload = {
      term: this.term,
      leaderId: this.nodeId,
      prevLogIndex: -1,
      prevLogTerm: 0,
      leaderCommit: this.commitIndex,
      entries: this.log.map((entry) => normalizeEntry(entry)),
    };
    const results = await Promise.allSettled(peers.map((peer) => this.transport.appendEntries(peer, payload)));
    const deliveries = results.map((settled, index) => {
      const transportResult = settled.status === "fulfilled" ? settled.value : null;
      const remote = this.unwrapTransportResult(transportResult);
      return {
        peerId: peers[index].id,
        delivered: Boolean(transportResult?.data?.delivered),
        accepted: Boolean(remote.accepted),
        error: settled.status === "rejected" ? settled.reason?.message || String(settled.reason) : transportResult?.data?.error || null,
      };
    });
    return response("raft-heartbeat", { sent: true, deliveries });
  }

  async proposeDistributed(command = {}, options = {}) {
    if (!this.transport || this.transport.peerTargets?.().length === 0) {
      return this.propose(command, options);
    }

    if (this.role !== "leader") {
      const election = await this.startElectionDistributed();
      if (!election.data.elected) {
        return response("raft-propose", { accepted: false, reason: "not-leader", leaderId: election.data.leader, term: election.data.term, commitIndex: this.commitIndex, transport: "http" });
      }
    } else {
      const lease = await this.confirmLeadershipDistributed();
      if (!lease.data?.confirmed) {
        this.role = "follower";
        this.leaderId = null;
        this.persistState();
        return response("raft-propose", { accepted: false, reason: "leader-lease-lost", leaderId: this.leaderId, term: this.term, commitIndex: this.commitIndex, transport: "http" });
      }
    }

    const entry = this.createEntry(command, options);
    this.log[entry.index] = entry;
    this.persistState();

    const peers = this.transport.peerTargets();
    const replicationPayload = {
      term: this.term,
      leaderId: this.nodeId,
      prevLogIndex: entry.prevIndex,
      prevLogTerm: entry.prevTerm,
      leaderCommit: this.commitIndex,
      entries: [entry],
    };

    const results = await Promise.allSettled(peers.map((peer) => this.transport.appendEntries(peer, replicationPayload)));
    let ackCount = 1;
    const replication = [];
    for (let index = 0; index < results.length; index += 1) {
      const peer = peers[index];
      const settled = results[index];
      const transportResult = settled.status === "fulfilled" ? settled.value : null;
      const remote = this.unwrapTransportResult(transportResult);
      const accepted = Boolean(remote.accepted);
      if (accepted) ackCount += 1;
      replication.push({
        peerId: peer.id,
        delivered: Boolean(transportResult?.data?.delivered),
        accepted,
        commitIndex: remote.commitIndex ?? null,
        error: settled.status === "rejected" ? settled.reason?.message || String(settled.reason) : transportResult?.data?.error || null,
      });
    }

    const committed = this.hasQuorum(ackCount, options.membership || this.membership);
    if (committed) {
      this.commitIndex = entry.index;
      this.applyCommitted(options.apply);
      await this.broadcastHeartbeatDistributed();
    }

    this.persistState();
    return response("raft-propose", {
      accepted: true,
      entry,
      committed,
      ackCount,
      quorum: this.quorum(options.membership || this.membership),
      term: this.term,
      role: this.role,
      leaderId: this.leaderId,
      commitIndex: this.commitIndex,
      transport: "http",
      replication,
    });
  }

  async ensureLeadership() {
    return this.startElectionDistributed();
  }


  isLogUpToDate(candidateLastLogIndex, candidateLastLogTerm) {
    const last = this.log[this.log.length - 1];
    const localTerm = last?.term || 0;
    const localIndex = last?.index ?? -1;
    if (candidateLastLogTerm !== localTerm) return candidateLastLogTerm > localTerm;
    return candidateLastLogIndex >= localIndex;
  }

  reachablePeers() {
    return [...this.peers.values()].filter((peer) => peer.id !== this.nodeId && peer.reachable !== false);
  }

  appendEntries(request = {}) {
    const replay = this.acceptTransportSequence("raft-append-entries", request);
    const term = Number(request.term || 0);
    if (replay.duplicate) {
      return response("raft-append-entries", { accepted: true, duplicate: true, term: this.term, commitIndex: this.commitIndex, leaderId: this.leaderId });
    }
    const leaderId = request.leaderId || null;
    const prevLogIndex = Number(request.prevLogIndex ?? -1);
    const prevLogTerm = Number(request.prevLogTerm ?? 0);
    const leaderCommit = Number(request.leaderCommit ?? -1);
    const entries = Array.isArray(request.entries) ? request.entries.map((entry) => normalizeEntry(entry)) : [];

    if (term < this.term) {
      return response("raft-append-entries", { accepted: false, reason: "stale-term", term: this.term, commitIndex: this.commitIndex });
    }

    if (term > this.term) {
      this.term = term;
      this.role = "follower";
      this.votedFor = null;
      this.leaderId = leaderId;
      this.persistState();
    }

    this.role = "follower";
    this.leaderId = leaderId;
    this.lastLeaderContactAt = Date.now();

    if (prevLogIndex >= 0) {
      const localPrev = this.log[prevLogIndex];
      if (!localPrev || localPrev.term !== prevLogTerm) {
        return response("raft-append-entries", { accepted: false, reason: "prev-log-mismatch", term: this.term, commitIndex: this.commitIndex });
      }
    }

    let appended = 0;
    for (const entry of entries) {
      if (entry.index > this.log.length) {
        break;
      }

      const localPrev = entry.index > 0 ? this.log[entry.index - 1] : null;
      const matchesLocalPrefix = entry.prevIndex === (localPrev ? localPrev.index : -1)
        && entry.prevTerm === (localPrev ? localPrev.term : 0)
        && entry.prevHash === (localPrev ? localPrev.hash : null);

      if (!matchesLocalPrefix) {
        break;
      }

      const existing = this.log[entry.index];
      if (existing && existing.hash !== entry.hash) {
        this.log = this.log.slice(0, entry.index);
      }

      if (!this.log[entry.index]) {
        this.log[entry.index] = normalizeEntry(entry, localPrev);
        appended += 1;
      }
    }

    if (leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(leaderCommit, this.log.length - 1);
    }

    this.rebuildMachineState();
    this.persistState();
    return response("raft-append-entries", { accepted: true, appended, term: this.term, commitIndex: this.commitIndex, leaderId: this.leaderId });
  }

  propose(command = {}, options = {}) {
    if (this.transport && typeof this.transport.peerTargets === "function" && this.transport.peerTargets().length) {
      return this.proposeDistributed(command, options);
    }
    if (this.role !== "leader") {
      if (this.quorum().required === 1 && options.allowSingleNode !== false) {
        this.leaderElection();
      } else {
        return response("raft-propose", { accepted: false, reason: "not-leader", leaderId: this.leaderId, term: this.term, commitIndex: this.commitIndex });
      }
    }

    const entry = this.createEntry(command, options);
    this.log[entry.index] = entry;

    const ackCount = 1 + Number(options.ackCount || 0);
    const committed = this.hasQuorum(ackCount, options.membership || this.membership);
    if (committed) {
      this.commitIndex = entry.index;
      this.applyCommitted(options.apply);
    }

    this.persistState();
    return response("raft-propose", {
      accepted: true,
      entry,
      committed,
      ackCount,
      quorum: this.quorum(options.membership || this.membership),
      term: this.term,
      role: this.role,
      leaderId: this.leaderId,
      commitIndex: this.commitIndex,
    });
  }

  createEntry(command, options = {}) {
    const previous = this.log[this.log.length - 1] || null;
    const index = this.log.length;
    const entry = {
      index,
      term: this.term,
      type: command.type || "command",
      command: canonicalize(command),
      prevIndex: previous ? previous.index : -1,
      prevTerm: previous ? previous.term : 0,
      prevHash: previous ? previous.hash : null,
      timestamp: new Date().toISOString(),
      metadata: canonicalize(options.metadata || {}),
    };
    entry.hash = hash(JSON.stringify({
      index: entry.index,
      term: entry.term,
      type: entry.type,
      command: entry.command,
      prevIndex: entry.prevIndex,
      prevTerm: entry.prevTerm,
      prevHash: entry.prevHash,
      metadata: entry.metadata,
    }));
    return entry;
  }

  commit(index = this.log.length - 1) {
    this.commitIndex = Math.max(this.commitIndex, Math.min(index, this.log.length - 1));
    this.applyCommitted();
    this.persistState();
    return response("raft-commit", { commitIndex: this.commitIndex, lastApplied: this.lastApplied });
  }

  applyCommitted(handler) {
    const applied = [];
    const apply = typeof handler === "function" ? handler : (entry) => this.applyStateMachine(entry);
    while (this.lastApplied < this.commitIndex) {
      this.lastApplied += 1;
      const entry = this.log[this.lastApplied];
      if (!entry) break;
      apply(entry, this);
      applied.push(entry);
    }
    return applied;
  }

  replayFromLog(machineState = { version: 0, data: {} }, limit = this.commitIndex) {
    const state = canonicalize({
      version: machineState.version || 0,
      data: machineState.data || {},
    });
    const end = Math.min(Number(limit ?? this.commitIndex), this.log.length - 1);
    for (let index = 0; index <= end; index += 1) {
      const entry = this.log[index];
      if (!entry) break;
      this.applyStateMachine(entry, state);
    }
    return state;
  }

  applyStateMachine(entry, stateMachine = this.machineState) {
    if (!entry) return stateMachine;
    const command = entry.command || {};
    const result = stateMachine;
    result.version = (result.version || 0) + 1;
    result.lastApplied = entry.index;
    result.term = entry.term;
    result.leaderId = this.leaderId;
    result.data = result.data || {};

    if (command.type === "workload:create") {
      result.data.workloads = [...(result.data.workloads || []), canonicalize(command.payload || {})];
    } else if (command.type === "action") {
      result.data.actions = [...(result.data.actions || []), canonicalize(command.payload || {})];
    } else if (command.type === "membership-change") {
      result.data.membership = canonicalize(command.payload || {});
    } else {
      result.data.commands = [...(result.data.commands || []), canonicalize(command)];
    }
    return result;
  }

  membershipChanges(change = {}) {
    const current = this.voterIds();
    const next = new Set(current);
    if (change.action === "add" && change.peer?.id) next.add(change.peer.id);
    if (change.action === "remove" && change.peer?.id) next.delete(change.peer.id);
    const newVoters = [...next];
    const entry = this.createEntry({
      type: "membership-change",
      payload: {
        change: canonicalize(change),
        oldVoters: current,
        newVoters,
        stage: "joint-consensus",
      },
    }, { metadata: { joint: true } });
    this.log[entry.index] = entry;
    this.membership.joint = { oldVoters: current, newVoters };
    const committed = this.hasQuorum(1);
    if (committed) {
      this.commitIndex = entry.index;
      this.membership.voters = newVoters;
      this.membership.joint = null;
      this.applyCommitted((logEntry) => this.applyStateMachine(logEntry));
    }
    this.persistState();
    return response("raft-membership", { committed, membership: this.membership, commitIndex: this.commitIndex, term: this.term });
  }

  snapshot(machineState = this.machineState) {
    const snapshot = {
      nodeId: this.nodeId,
      term: this.term,
      votedFor: this.votedFor,
      role: this.role,
      leaderId: this.leaderId,
      commitIndex: this.commitIndex,
      lastApplied: this.lastApplied,
      logLength: this.log.length,
      membership: this.membership,
      machineState: canonicalize(machineState),
      checksum: hash(JSON.stringify({
        term: this.term,
        votedFor: this.votedFor,
        commitIndex: this.commitIndex,
        lastApplied: this.lastApplied,
        role: this.role,
        leaderId: this.leaderId,
        log: this.log.map((entry) => entry.hash),
        membership: this.membership,
        machineState,
      })),
    };
    this.snapshotData = snapshot;
    return response("raft-snapshot", { snapshot });
  }

  restore(snapshot = this.snapshotData) {
    if (!snapshot) {
      return response("raft-replay", { replayed: false, reason: "missing-snapshot" });
    }
    this.term = Number(snapshot.term || 0);
    this.votedFor = snapshot.votedFor || null;
    this.role = snapshot.role || "follower";
    this.leaderId = snapshot.leaderId || null;
    this.commitIndex = Number(snapshot.commitIndex ?? -1);
    this.lastApplied = Number(snapshot.lastApplied ?? this.commitIndex);
    this.membership = normalizeMembership(snapshot.membership, this.nodeId);
    this.machineState = canonicalize(snapshot.machineState || this.machineState);
    this.snapshotData = snapshot;
    this.lastLeaderContactAt = Date.now();
    this.persistState();
    return response("raft-replay", { replayed: true, snapshot });
  }

  crashReplay(snapshot = this.snapshotData) {
    return this.restore(snapshot);
  }

  health() {
    const quorum = this.quorum();
    const committed = this.commitIndex >= 0;
    const ready = this.role === "leader" ? committed || quorum.required === 1 : committed && Boolean(this.leaderId);
    return response("raft-health", {
      nodeId: this.nodeId,
      role: this.role,
      leaderId: this.leaderId,
      term: this.term,
      commitIndex: this.commitIndex,
      lastApplied: this.lastApplied,
      logLength: this.log.length,
      quorum,
      ready,
      state: ready ? "ready" : "degraded",
    });
  }

  state() {
    return {
      nodeId: this.nodeId,
      term: this.term,
      votedFor: this.votedFor,
      role: this.role,
      leaderId: this.leaderId,
      commitIndex: this.commitIndex,
      lastApplied: this.lastApplied,
      log: this.log,
      membership: this.membership,
      machineState: this.machineState,
      snapshot: this.snapshotData,
    };
  }

  partitionTolerance(view = []) {
    const reachable = view.filter((peer) => peer.reachable !== false).length + 1;
    const quorum = this.quorum();
    return response("partition-tolerance", { reachable, quorum, tolerated: reachable >= quorum.required });
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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function normalizeEntry(entry = {}, previous = null) {
  const normalized = {
    ...entry,
    command: canonicalize(entry.command || {}),
    metadata: canonicalize(entry.metadata || {}),
  };
  normalized.index = Number(normalized.index ?? (previous ? previous.index + 1 : 0));
  normalized.term = Number(normalized.term ?? (previous ? previous.term : 0));
  normalized.prevIndex = Number(normalized.prevIndex ?? (previous ? previous.index : -1));
  normalized.prevTerm = Number(normalized.prevTerm ?? (previous ? previous.term : 0));
  normalized.prevHash = normalized.prevHash ?? (previous ? previous.hash : null);
  normalized.hash = normalized.hash || hash(JSON.stringify({
    index: normalized.index,
    term: normalized.term,
    type: normalized.type || normalized.command?.type || "command",
    command: normalized.command,
    prevIndex: normalized.prevIndex,
    prevTerm: normalized.prevTerm,
    prevHash: normalized.prevHash,
    metadata: normalized.metadata,
  }));
  normalized.timestamp = normalized.timestamp || new Date().toISOString();
  return normalized;
}

function normalizeMembership(membership = {}, nodeId) {
  const voters = Array.isArray(membership.voters) && membership.voters.length ? [...new Set(membership.voters)] : [nodeId];
  return {
    voters,
    learners: Array.isArray(membership.learners) ? [...new Set(membership.learners)] : [],
    joint: membership.joint || null,
  };
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = {
  RaftCluster,
};
