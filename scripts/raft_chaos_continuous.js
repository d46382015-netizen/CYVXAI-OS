"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  buildPeers,
  fetchRaftState,
  raftFingerprint,
  requestJson,
  spawnNode,
  stableStringify,
  stopCluster,
  submitWorkload,
  waitForCluster,
  waitForLeader,
  withTemporaryDir,
} = require("./raft_cluster_runtime");
const { emit, extractStateHash, checkLinearizability } = require("./raft_oracle");
const { recordWrite, recordCommit, validateFinalRun, metricsSnapshot } = require("./raft_workload_guard");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function createDeterministicRng(seed) {
  let state = crypto.createHash("sha256").update(String(seed)).digest().readUInt32BE(0) || 1;
  return {
    next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0xffffffff;
    },
    int(max) {
      return Math.floor(this.next() * Math.max(1, max));
    },
    pick(items) {
      return items[this.int(items.length)];
    },
  };
}

function defaultChaosConfig(seed) {
  return {
    seed,
    packetLossRate: 0.1,
    latencyMinMs: 0,
    latencyMaxMs: 250,
    reorderWindow: 4,
    reorderStepMs: 35,
    reorderProbability: 0.35,
    leaderKillProbability: 0.12,
    followerRestartProbability: 0.18,
  };
}

function normalizeChaosConfig(input) {
  const raw = parseJson(input, null) || {};
  const seed = String(raw.seed || process.env.CYVX_CHAOS_SEED || "cyvx-chaos");
  const base = defaultChaosConfig(seed);
  return {
    ...base,
    ...raw,
    seed,
    packetLossRate: clamp(raw.packetLossRate ?? raw.packetLoss ?? base.packetLossRate, 0, 0.5),
    latencyMinMs: clamp(raw.latencyMinMs ?? base.latencyMinMs, 0, 500),
    latencyMaxMs: clamp(raw.latencyMaxMs ?? base.latencyMaxMs, 0, 500),
    reorderWindow: Math.max(1, Math.floor(raw.reorderWindow ?? base.reorderWindow)),
    reorderStepMs: Math.max(1, Math.floor(raw.reorderStepMs ?? base.reorderStepMs)),
    reorderProbability: clamp(raw.reorderProbability ?? base.reorderProbability, 0, 1),
    leaderKillProbability: clamp(raw.leaderKillProbability ?? base.leaderKillProbability, 0, 1),
    followerRestartProbability: clamp(raw.followerRestartProbability ?? base.followerRestartProbability, 0, 1),
  };
}

function chaosPlanForPeer(chaosConfig, peerId, kind, sequence) {
  const key = `${chaosConfig.seed}:${peerId}:${kind}:${sequence}`;
  const hash = crypto.createHash("sha256").update(key).digest();
  return {
    drop: hash.readUInt32BE(0) / 0xffffffff < chaosConfig.packetLossRate,
    latencyFactor: (hash.readUInt32BE(4) / 0xffffffff) ** 2,
    reorderFactor: hash.readUInt32BE(8) / 0xffffffff,
    killFactor: hash.readUInt32BE(12) / 0xffffffff,
    restartFactor: hash.readUInt32BE(16) / 0xffffffff,
  };
}

function dumpDiagnostics(dir, payload) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "diagnostics.json"), JSON.stringify(payload, null, 2));
}

async function fetchClusterState(peers, apiKey) {
  const states = [];
  for (const peer of peers) {
    try {
      const state = await fetchRaftState(peer, apiKey);
      states.push({ peer: peer.id, state });
    } catch (error) {
      states.push({ peer: peer.id, state: null, error: error.message });
    }
  }
  return states;
}


function invariantsOk(states, lastCommitIndexes, timeline) {
  const liveStates = states.filter((item) => item && item.state);
  const leadersByTerm = new Map();
  for (const { peer, state } of liveStates) {
    const term = Number(state?.term ?? 0);
    const role = state?.role;
    if (role === "leader") {
      const leaders = leadersByTerm.get(term) || [];
      leaders.push(peer);
      leadersByTerm.set(term, leaders);
    }
  }

  for (const [term, leaders] of leadersByTerm.entries()) {
    if (leaders.length > 1) {
      return { ok: false, reason: `multiple-leaders-term-${term}`, details: leaders };
    }
  }

  for (const { peer, state } of liveStates) {
    const commitIndex = Number(state?.commitIndex ?? -1);
    const previous = lastCommitIndexes.get(peer);
    if (previous != null && commitIndex < previous) {
      return { ok: false, reason: `commit-index-regressed-${peer}`, details: { previous, commitIndex } };
    }
    lastCommitIndexes.set(peer, commitIndex);
  }

  const committedPrefix = liveStates.reduce((min, { state }) => Math.min(min, Number(state?.commitIndex ?? -1)), Number.POSITIVE_INFINITY);
  if (committedPrefix >= 0) {
    const prefixHashes = liveStates.map(({ state }) => {
      const prefix = Array.isArray(state?.log) ? state.log.slice(0, committedPrefix + 1) : [];
      return crypto.createHash("sha256").update(stableStringify(prefix)).digest("hex");
    });
    if ([...new Set(prefixHashes)].length !== 1) {
      return { ok: false, reason: "committed-prefix-divergence", details: prefixHashes };
    }
  }

  const stateHashes = liveStates.map(({ state }) => extractStateHash(state));
  const quiescent = timeline.length > 5 && timeline.slice(-5).every((event) => event.kind !== "write");
  if (quiescent && [...new Set(stateHashes)].length !== 1) {
    return { ok: false, reason: "state-hash-divergence-under-quiescence", details: stateHashes };
  }

  return { ok: true };
}

async function restartNode(index, nodes, peers, apiKey, raftToken, dbDir, chaosConfig, timeline) {
  const entry = nodes[index];
  if (entry?.child && !entry.child.killed) {
    entry.child.kill("SIGKILL");
    await new Promise((resolve) => entry.child.once("exit", resolve));
  }
  nodes[index] = {
    peer: peers[index],
    child: spawnNode({
      peer: peers[index],
      peers,
      apiKey,
      raftToken,
      dbDir,
      chaosConfig,
    }),
  };
  timeline.push({ at: new Date().toISOString(), kind: "restart", nodeId: peers[index].id });
}

async function killNode(index, nodes, timeline) {
  const entry = nodes[index];
  if (!entry?.child || entry.child.killed) return;
  entry.child.kill("SIGKILL");
  await new Promise((resolve) => entry.child.once("exit", resolve));
  timeline.push({ at: new Date().toISOString(), kind: "kill", nodeId: entry.peer.id });
}

/**
 * CAUSAL EXPLAINER HOOK
 */
try {
  const causal = require("./lab/causal/analyzer");

  process.on("exit", () => {
    try {
      const report = causal.analyze();

      const fs = require("fs");
      fs.writeFileSync(
        "/root/scripts/lab/causal_report.json",
        JSON.stringify(report, null, 2)
      );

      console.log("[CAUSAL] report written");
    } catch (e) {
      console.error("[CAUSAL] failed:", e.message);
    }
  });
} catch (e) {
  console.error("[CAUSAL INIT FAIL]", e.message);
}

async function main() {
  const durationMs = Math.max(60_000, Number(process.env.CYVX_CHAOS_DURATION_MS || 600_000));
  const writeIntervalMs = Math.max(200, Number(process.env.CYVX_CHAOS_WRITE_INTERVAL_MS || 750));
  const monitorIntervalMs = Math.max(250, Number(process.env.CYVX_CHAOS_MONITOR_INTERVAL_MS || 1000));
  const chaosConfig = normalizeChaosConfig(process.env.CYVX_CHAOS_CONFIG);
  const rng = createDeterministicRng(chaosConfig.seed);
  const peers = buildPeers(Number(process.env.CYVX_BASE_PORT || 4401), 3);
  const apiKey = process.env.CYVX_API_KEY || "cyvx-dev-api-key";
  const raftToken = process.env.CYVX_RAFT_TOKEN || "cyvx-dev-raft-token";
  const dbDir = process.env.CYVX_RAFT_DB_DIR || withTemporaryDir("cyvx-chaos");
  const diagDir = process.env.CYVX_CHAOS_DIAG_DIR || path.join(dbDir, "diagnostics");
  const nodes = peers.map((peer) => ({
    peer,
    child: spawnNode({ peer, peers, apiKey, raftToken, dbDir, chaosConfig }),
  }));
  const timeline = [];
  const lastCommitIndexes = new Map();
  const violationCounts = new Map();
  let failed = false;
  let failureReason = null;

  const fail = async (reason, details) => {
    if (failed) return;
    failed = true;
    failureReason = reason;
    const states = await fetchClusterState(peers, apiKey).catch(() => []);
    dumpDiagnostics(diagDir, {
      reason,
      details,
      timeline,
      states,
      chaosConfig,
      durationMs,
      writeIntervalMs,
      monitorIntervalMs,
      eventLog: global.__RAFT_EVENT_LOG__ || [],
      metrics: metricsSnapshot(),
    });
    await stopCluster(nodes.map((node) => node.child));
    throw new Error(`${reason}: ${stableStringify(details)}`);
  };

  process.on("SIGINT", async () => {
    await stopCluster(nodes.map((node) => node.child));
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await stopCluster(nodes.map((node) => node.child));
    process.exit(0);
  });

  await waitForCluster(peers);
  await waitForLeader(peers);

  const startAt = Date.now();
  let writeSeq = 0;
  let committedWrites = 0;
  let nextWriteAt = Date.now();
  let nextMonitorAt = Date.now();
  let nextChaosAt = Date.now();

  while (!failed && Date.now() - startAt < durationMs) {
    const now = Date.now();

    if (now >= nextWriteAt) {
      const leader = await waitForLeader(peers).catch(() => null);
      if (!leader) {
        nextWriteAt = now + 250;
        continue;
      }
      const payload = {
        id: `chaos-write-${writeSeq}`,
        type: "workload:create",
        payload: { id: `chaos-write-${writeSeq}`, seq: writeSeq, node: leader.peer.id },
      };
      try {
        await submitWorkload(leader.peer, apiKey, payload);
        committedWrites += 1;
        recordWrite();
        recordCommit(writeSeq);
        emit({ type: "commit", index: writeSeq, value: payload.payload });
        recordWrite();
        recordCommit(writeSeq);
        emit({ type: "commit", index: writeSeq, value: payload.payload });
        timeline.push({ at: new Date().toISOString(), kind: "write", seq: writeSeq, leader: leader.peer.id });
      } catch (error) {
        timeline.push({ at: new Date().toISOString(), kind: "write-failed", seq: writeSeq, leader: leader.peer.id, error: error.message });
      }
      writeSeq += 1;
      nextWriteAt = now + writeIntervalMs;
    }

    if (now >= nextChaosAt) {
      const chaoticEvent = chaosPlanForPeer(chaosConfig, peers[0].id, "loop", writeSeq);
      const leader = await waitForLeader(peers).catch(() => null);
      const followerIndexes = peers.map((_, index) => index).filter((index) => !leader || peers[index].id !== leader.peer.id);

      if (leader && chaoticEvent.killFactor < chaosConfig.leaderKillProbability && rng.next() < chaosConfig.leaderKillProbability) {
        const leaderIndex = peers.findIndex((peer) => peer.id === leader.peer.id);
        await killNode(leaderIndex, nodes, timeline);
        await sleep(200 + Math.round(rng.next() * 400));
        await restartNode(leaderIndex, nodes, peers, apiKey, raftToken, dbDir, chaosConfig, timeline);
      } else if (followerIndexes.length && rng.next() < chaosConfig.followerRestartProbability) {
        const targetIndex = followerIndexes[rng.int(followerIndexes.length)];
        await killNode(targetIndex, nodes, timeline);
        await sleep(200 + Math.round(rng.next() * 300));
        await restartNode(targetIndex, nodes, peers, apiKey, raftToken, dbDir, chaosConfig, timeline);
      }
      nextChaosAt = now + Math.max(500, Math.round(chaosConfig.latencyMaxMs + rng.next() * 1500));
    }

    if (now >= nextMonitorAt) {
      const states = await fetchClusterState(peers, apiKey);
      timeline.push({ at: new Date().toISOString(), kind: "monitor", states: states.map(({ peer, state }) => ({ peer, commitIndex: state?.commitIndex, term: state?.term, role: state?.role })) });
      const invariantResult = invariantsOk(states, lastCommitIndexes, timeline);
      if (!invariantResult.ok) {
        const count = (violationCounts.get(invariantResult.reason) || 0) + 1;
        violationCounts.set(invariantResult.reason, count);
        timeline.push({ at: new Date().toISOString(), kind: "violation", reason: invariantResult.reason, count, details: invariantResult.details });
        if (count >= 3) {
          await fail(invariantResult.reason, invariantResult.details);
        }
      } else {
        violationCounts.clear();
      }
      nextMonitorAt = now + monitorIntervalMs;
    }

    await sleep(50);
  }

  await sleep(Math.max(2000, chaosConfig.latencyMaxMs * 2));

  let recovered = false;
  let finalStates = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const leader = await waitForLeader(peers).catch(() => null);
    if (leader) {
      try {
        await submitWorkload(leader.peer, apiKey, {
          id: `chaos-final-`,
          type: "workload:create",
          payload: { id: `chaos-final-`, seq: writeSeq, stage: "final" },
        });
        committedWrites += 1;
      } catch {
        // retry until the cluster stabilizes
      }
    }

    finalStates = await fetchClusterState(peers, apiKey);
    const finalLive = finalStates.filter((item) => item && item.state);
    const finalCommitIndex = finalLive.reduce((min, { state }) => Math.min(min, Number(state?.commitIndex ?? -1)), Number.POSITIVE_INFINITY);
    const finalPrefixHashes = finalLive.map(({ state }) => {
      const prefix = Array.isArray(state?.log) ? state.log.slice(0, finalCommitIndex + 1) : [];
      return crypto.createHash("sha256").update(stableStringify(prefix)).digest("hex");
    });
    const finalHashes = finalLive.map(({ state }) => extractStateHash(state));
    if (finalLive.length >= 2 && finalCommitIndex >= 0 && [...new Set(finalHashes)].length === 1 && [...new Set(finalPrefixHashes)].length === 1) {
      recovered = true;
      break;
    }
    await sleep(250);
  }

  if (!recovered || committedWrites === 0) {
    finalStates = await fetchClusterState(peers, apiKey);
    await fail("final-convergence-failed", finalStates);
  }

  validateFinalRun();
  checkLinearizability();

  process.stdout.write("raft chaos continuity passed\n");
  process.stdout.write(`diag=${diagDir}\n`);
  process.stdout.write(`states=${stableStringify(finalStates.map(({ peer, state }) => ({ peer, commitIndex: state?.commitIndex, term: state?.term, leaderId: state?.leaderId }))) }\n`);

  await stopCluster(nodes.map((node) => node.child));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
