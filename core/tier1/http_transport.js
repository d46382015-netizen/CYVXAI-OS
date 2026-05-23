"use strict";

const crypto = require("node:crypto");

const { response } = require("../shared/attribution");

function normalizePeer(peer, index = 0) {
  if (!peer) return null;
  if (typeof peer === "string") {
    return { id: peer, url: peer, reachable: true, index };
  }
  const url = peer.url || peer.endpoint || peer.address || peer.baseUrl || "";
  return {
    id: peer.id || url || `peer-${index}`,
    url,
    reachable: peer.reachable !== false,
    index: Number(peer.index ?? index),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function jitter(ms, ratio = 0.2) {
  const base = Math.max(0, Number(ms) || 0);
  const spread = base * ratio;
  return Math.max(0, Math.round(base + ((Math.random() * 2 - 1) * spread)));
}

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function parseFailurePlan(plan) {
  if (!plan) return null;
  if (typeof plan === "object") return plan;
  if (typeof plan !== "string") return null;
  try {
    return JSON.parse(plan);
  } catch {
    return null;
  }
}

function valueForPeer(config, peerId) {
  if (!config) return null;
  if (typeof config === "number") return config;
  if (Array.isArray(config)) return config.includes(peerId) ? true : null;
  if (typeof config === "object") {
    if (Object.prototype.hasOwnProperty.call(config, peerId)) return config[peerId];
    if (config.default != null) return config.default;
  }
  return null;
}

function seededInt(seed, parts) {
  return crypto.createHash("sha256").update(seed + "|" + parts.join("|")).digest().readUInt32BE(0);
}

function seededFloat(seed, parts) {
  return seededInt(seed, parts) / 4294967295;
}

function normalizeChaosConfig(input) {
  if (!input) return null;
  const raw = typeof input === "string" ? parseJsonSafe(input) : input;
  if (!raw || typeof raw !== "object") return null;
  return {
    seed: String(raw.seed || process.env.CYVX_CHAOS_SEED || "cyvx-chaos"),
    packetLossRate: Math.min(0.5, Math.max(0, Number(raw.packetLossRate ?? raw.packetLoss ?? 0))),
    latencyMinMs: Math.max(0, Number(raw.latencyMinMs ?? 0)),
    latencyMaxMs: Math.max(0, Number(raw.latencyMaxMs ?? raw.latencyMs ?? 0)),
    reorderWindow: Math.max(1, Number(raw.reorderWindow ?? 1)),
    reorderStepMs: Math.max(1, Number(raw.reorderStepMs ?? 25)),
    reorderProbability: Math.min(1, Math.max(0, Number(raw.reorderProbability ?? 0))),
    leaderKillProbability: Math.min(1, Math.max(0, Number(raw.leaderKillProbability ?? 0))),
    followerRestartProbability: Math.min(1, Math.max(0, Number(raw.followerRestartProbability ?? 0))),
  };
}

function createFailureInjector(planInput) {
  const plan = normalizeChaosConfig(planInput);
  if (!plan) return null;
  const buffers = new Map();
  const seed = plan.seed;
  return (context) => {
    const peerId = context?.peer?.id || "";
    const op = context?.op || "raft";
    const sequence = Number(context?.sequence || 0);
    const attempt = Number(context?.attempt || 0);
    const key = peerId + ":" + op;
    const buffer = buffers.get(key) || [];
    const score = seededInt(seed, [peerId, op, sequence, attempt, buffer.length]);
    buffer.push({ sequence, attempt, score });
    while (buffer.length > plan.reorderWindow) buffer.shift();
    buffers.set(key, buffer);

    if (seededFloat(seed, [peerId, op, sequence, attempt, "drop"]) < plan.packetLossRate) {
      return { drop: true, reason: "planned-drop" };
    }

    const baseDelay = plan.latencyMaxMs > plan.latencyMinMs
      ? plan.latencyMinMs + Math.floor((plan.latencyMaxMs - plan.latencyMinMs) * Math.pow(seededFloat(seed, [peerId, op, sequence, attempt, "latency"]), 2))
      : plan.latencyMinMs;
    const reorderBias = (score % plan.reorderWindow) * plan.reorderStepMs;
    const reorderEnabled = seededFloat(seed, [peerId, op, sequence, attempt, "reorder"]) < plan.reorderProbability;
    const delayMs = baseDelay + (reorderEnabled ? reorderBias : 0);
    return delayMs > 0 ? { delayMs } : null;
  };
}

class HttpRaftTransport {
  constructor(options = {}) {
    this.nodeId = options.nodeId || "node-1";
    this.selfUrl = options.selfUrl || "";
    this.timeoutMs = Math.max(100, Number(options.timeoutMs || 2500));
    this.maxRetries = Math.max(0, Number(options.maxRetries || 3));
    this.backoffMs = Math.max(10, Number(options.backoffMs || 100));
    this.jitterRatio = Number(options.jitterRatio || 0.2);
    this.raftToken = options.raftToken || "";
    this.logger = options.logger || console;
    this.failurePlan = options.failurePlan ?? process.env.CYVX_RAFT_FAILURE_PLAN ?? null;
    this.chaosConfig = options.chaosConfig ?? process.env.CYVX_CHAOS_CONFIG ?? null;
    this.failureInjector = options.failureInjector || createFailureInjector(this.chaosConfig || this.failurePlan);
    this.sequence = new Map();
    this.peers = new Map();
    this.setPeers(options.peers || []);
  }

  setPeers(peers = []) {
    this.peers.clear();
    peers.map(normalizePeer).filter(Boolean).forEach((peer) => {
      this.peers.set(peer.id, peer);
    });
    return this.describe().data;
  }

  setFailureInjector(injector) {
    this.failureInjector = injector || null;
    return this.describe().data;
  }

  peerTargets(excludeSelf = true) {
    return [...this.peers.values()].filter((peer) => peer.reachable !== false && (!excludeSelf || peer.id !== this.nodeId));
  }

  peerUrl(peer) {
    const normalized = normalizePeer(peer);
    if (!normalized?.url) throw new Error(`missing peer url for ${normalized?.id || "peer"}`);
    return normalized.url.replace(/\/$/, "");
  }

  nextSequence(peerId, op) {
    const key = `${peerId}:${op}`;
    const next = (this.sequence.get(key) || 0) + 1;
    this.sequence.set(key, next);
    return next;
  }

  describe() {
    return response("raft-transport", {
      transport: "http",
      nodeId: this.nodeId,
      selfUrl: this.selfUrl,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      backoffMs: this.backoffMs,
      orderedDelivery: "per-peer sequence numbers",
      failureInjection: Boolean(this.failureInjector),
      peers: this.peerTargets(false).map((peer) => ({ id: peer.id, url: peer.url, reachable: peer.reachable })),
    });
  }

  async requestVote(peer, payload = {}) {
    return this.sendRpc(peer, "request-vote", "/raft/request-vote", payload);
  }

  async appendEntries(peer, payload = {}) {
    return this.sendRpc(peer, "append-entries", "/raft/append-entries", payload);
  }

  async sendRpc(peer, op, pathname, payload = {}) {
    const target = normalizePeer(peer);
    if (!target?.url) {
      return response("raft-transport", {
        delivered: false,
        op,
        peer: target || null,
        error: "missing-peer-url",
      });
    }

    const sequence = this.nextSequence(target.id, op);
    const requestBody = {
      ...payload,
      sourceId: this.nodeId,
      sequence,
      sentAt: new Date().toISOString(),
      op,
    };
    const url = `${this.peerUrl(target)}${pathname}`;
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const injection = await this.applyFailureInjection({ op, peer: target, requestBody, attempt, sequence });
      if (injection?.drop) {
        lastError = new Error(injection.reason || "dropped-by-injector");
        continue;
      }
      if (injection?.delayMs) {
        await sleep(injection.delayMs);
      }

      const timeoutMs = Math.max(1, Number(injection?.timeoutMs || this.timeoutMs));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("raft-transport-timeout")), timeoutMs);
      timer.unref?.();

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: this.requestHeaders(op, sequence),
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        const text = await res.text();
        const body = parseJsonSafe(text);
        if (res.ok) {
          return response("raft-transport", {
            delivered: true,
            op,
            peer: target,
            sequence,
            attempt,
            status: res.status,
            url,
            request: requestBody,
            response: body,
          });
        }

        lastError = new Error(body?.error || body?.data?.error || `raft transport ${res.status}`);
        if (!isRetryableStatus(res.status) || attempt >= this.maxRetries) {
          return response("raft-transport", {
            delivered: false,
            op,
            peer: target,
            sequence,
            attempt,
            status: res.status,
            url,
            request: requestBody,
            response: body,
            error: lastError.message,
          });
        }
      } catch (error) {
        lastError = error;
        if (attempt >= this.maxRetries) {
          break;
        }
      } finally {
        clearTimeout(timer);
      }

      await sleep(this.backoffDelay(attempt));
    }

    return response("raft-transport", {
      delivered: false,
      op,
      peer: target,
      sequence,
      url,
      request: requestBody,
      error: lastError ? lastError.message : "transport-failed",
    });
  }

  requestHeaders(op, sequence) {
    const headers = {
      "content-type": "application/json",
      "x-cyvx-node-id": this.nodeId,
      "x-cyvx-raft-op": op,
      "x-cyvx-raft-seq": String(sequence),
    };
    if (this.raftToken) {
      headers.authorization = `Bearer ${this.raftToken}`;
      headers["x-cyvx-raft-token"] = this.raftToken;
    }
    return headers;
  }

  backoffDelay(attempt) {
    const base = this.backoffMs * (2 ** attempt);
    return jitter(base, this.jitterRatio);
  }

  async applyFailureInjection(context) {
    if (!this.failureInjector) return null;
    if (typeof this.failureInjector === "function") {
      return this.failureInjector(context) || null;
    }
    if (typeof this.failureInjector === "object") {
      const rule = this.failureInjector[context.op] || this.failureInjector.default || null;
      if (typeof rule === "function") return rule(context) || null;
      return rule;
    }
    return null;
  }
}

module.exports = {
  HttpRaftTransport,
};
