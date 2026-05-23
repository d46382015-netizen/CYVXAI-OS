// © 2026 Dakota Lee Jonsgaard
"use strict";

const { response } = require("../shared/attribution");

class EdgeIntelligence {
  constructor() {
    this.nodes = new Map();
  }

  registerEdgeNode(node) {
    const record = {
      id: node.id,
      location: node.location,
      capability: node.capability || "lightweight",
      latencyMs: Number(node.latencyMs || 0),
      updatedAt: new Date().toISOString(),
    };
    this.nodes.set(record.id, record);
    return response("edge-node-registered", { node: record });
  }

  makeLocalDecision(nodeId, signal) {
    const node = this.nodes.get(nodeId);
    if (!node) return response("edge-decision", { decided: false, reason: "node-not-found" });
    const decision = {
      nodeId,
      action: signal.priority === "low-latency" ? "execute-locally" : "sync-to-core",
      rationale: signal.rationale || "edge policy applied",
      latencyBudgetMs: signal.latencyBudgetMs ?? node.latencyMs,
    };
    return response("edge-decision", { decided: true, decision });
  }

  syncOffPeak(nodeId, snapshot) {
    const node = this.nodes.get(nodeId);
    if (!node) return response("edge-sync", { synced: false, reason: "node-not-found" });
    return response("edge-sync", {
      synced: true,
      nodeId,
      payloadSize: JSON.stringify(snapshot || {}).length,
      schedule: "off-peak",
    });
  }
}

module.exports = {
  EdgeIntelligence,
};
