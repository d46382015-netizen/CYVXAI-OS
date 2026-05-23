"use strict";

const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function buildPeers(basePort = 4101, size = 3) {
  return Array.from({ length: size }, (_, index) => {
    const port = Number(basePort) + index;
    return {
      id: `cyvx-node-${index + 1}`,
      url: `http://127.0.0.1:${port}`,
      port,
      index,
    };
  });
}

function buildPeerEnv(peers) {
  return JSON.stringify(peers.map(({ id, url, port, index }) => ({ id, url, port, index })));
}

function spawnNode({ peer, peers, apiKey, raftToken, dbDir, failurePlan = null, chaosConfig = null }) {
  const env = {
    ...process.env,
    CYVX_PORT: String(peer.port),
    CYVX_API_KEY: apiKey,
    CYVX_RAFT_TOKEN: raftToken,
    CYVX_NODE_ID: peer.id,
    CYVX_DB_FILE: `${dbDir}/${peer.id}.json`,
    RAFT_PEERS: buildPeerEnv(peers),
    RAFT_CLUSTER_SIZE: String(peers.length),
    RAFT_PORT: String(peer.port),
    CYVX_RAFT_TIMEOUT_MS: "1200",
    CYVX_RAFT_ELECTION_TIMEOUT_MS: "900",
    CYVX_RAFT_HEARTBEAT_INTERVAL_MS: "250",
    CYVX_RAFT_TICK_MS: "200",
  };

  if (failurePlan) {
    env.CYVX_RAFT_FAILURE_PLAN = typeof failurePlan === "string" ? failurePlan : JSON.stringify(failurePlan);
  }
  if (chaosConfig) {
    env.CYVX_CHAOS_CONFIG = typeof chaosConfig === "string" ? chaosConfig : JSON.stringify(chaosConfig);
  }

  const child = spawn(process.execPath, ["/root/scripts/raft_node_server.js"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${peer.id}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${peer.id} ERR] ${chunk}`));

  return child;
}

async function requestJson(url, { method = "GET", headers = {}, body = null, timeoutMs = 2000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("request-timeout")), timeoutMs);
  timer.unref?.();

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForNode(peer, { attempts = 60, delayMs = 250 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await requestJson(`${peer.url}/raft/health`, { timeoutMs: 1500 });
      if (result.ok) {
        return result.data;
      }
    } catch {
      // keep polling
    }
    await sleep(delayMs);
  }
  throw new Error(`node ${peer.id} did not become ready`);
}

async function waitForCluster(peers, options = {}) {
  for (const peer of peers) {
    await waitForNode(peer, options);
  }
}

function unwrapResponse(payload) {
  return payload?.data?.data || payload?.data || payload || null;
}

async function raftHealth(peer) {
  const result = await requestJson(peer.url + "/raft/health");
  return unwrapResponse(result.data);
}

async function fetchRaftState(peer, apiKey) {
  const result = await requestJson(peer.url + "/raft/state", {
    headers: { authorization: "Bearer " + apiKey },
  });
  return unwrapResponse(result.data);
}

async function fetchState(peer, apiKey) {
  const result = await requestJson(`${peer.url}/api/v1/state`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  return unwrapResponse(result.data);
}

function findRaftLikeObject(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  const keys = Object.keys(value);
  const looksLikeRaft = ["term", "commitIndex", "lastApplied", "leaderId"].every((key) => Object.prototype.hasOwnProperty.call(value, key));
  if (looksLikeRaft && (Object.prototype.hasOwnProperty.call(value, "log") || Object.prototype.hasOwnProperty.call(value, "machineState"))) {
    return value;
  }
  for (const key of keys) {
    const nested = findRaftLikeObject(value[key], seen);
    if (nested) return nested;
  }
  return null;
}

function raftFingerprint(state) {
  const raft = findRaftLikeObject(state) || state;
  return stableStringify({
    term: raft?.term ?? null,
    commitIndex: raft?.commitIndex ?? null,
    lastApplied: raft?.lastApplied ?? null,
    leaderId: raft?.leaderId ?? null,
    log: Array.isArray(raft?.log) ? raft.log : [],
    machineState: raft?.machineState ?? null,
  });
}

async function submitWorkload(peer, apiKey, workload) {
  const result = await requestJson(peer.url + "/raft/propose", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey },
    body: { command: workload, options: workload.options || {} },
    timeoutMs: 4000,
  });
  if (!result.ok) {
    throw new Error("workload submit failed on " + peer.id + ": " + result.status);
  }
  return unwrapResponse(result.data);
}

async function currentLeader(peers) {
  for (const peer of peers) {
    try {
      const health = await raftHealth(peer);
      if (health?.role === "leader" && health?.leaderId === peer.id) {
        return { peer, health };
      }
    } catch {
      // keep probing other nodes under chaos
    }
  }
  return null;
}

async function waitForLeader(peers, { attempts = 60, delayMs = 250 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const leader = await currentLeader(peers);
    if (leader) return leader;
    await sleep(delayMs);
  }
  throw new Error("no leader elected");
}

async function stopCluster(children) {
  const exits = children.map((child) => {
    if (!child || child.killed) return Promise.resolve();
    return new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 1500).unref?.();
    });
  });
  await Promise.allSettled(exits);
}

function withTemporaryDir(prefix = "cyvx-raft") {
  const id = crypto.randomUUID();
  const dir = `/tmp/${prefix}-${id}`;
  return dir;
}

module.exports = {
  buildPeers,
  buildPeerEnv,
  currentLeader,
  fetchRaftState,
  fetchState,
  findRaftLikeObject,
  raftFingerprint,
  requestJson,
  spawnNode,
  stableStringify,
  stopCluster,
  submitWorkload,
  waitForCluster,
  waitForLeader,
  waitForNode,
  withTemporaryDir,
};
