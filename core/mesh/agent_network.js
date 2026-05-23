// © 2026 Dakota Lee Jonsgaard
"use strict";

const { EventEmitter } = require("events");
const { response } = require("../shared/attribution");

class AgentNetwork extends EventEmitter {
  constructor() {
    super();
    this.nodes = new Map();
    this.coordinatorId = null;
  }

  registerNode(node) {
    const record = {
      id: node.id,
      region: node.region,
      malicious: Boolean(node.malicious),
      score: Number(node.score || 0),
      updatedAt: new Date().toISOString(),
    };
    this.nodes.set(record.id, record);
    return response("node-registered", { node: record });
  }

  electCoordinator() {
    const eligible = [...this.nodes.values()].filter((node) => !node.malicious);
    if (eligible.length === 0) {
      this.coordinatorId = null;
      return response("coordinator-election", { coordinatorId: null, reason: "no-eligible-nodes" });
    }
    eligible.sort((a, b) => b.score - a.score);
    this.coordinatorId = eligible[0].id;
    return response("coordinator-election", { coordinatorId: this.coordinatorId, quorumSatisfied: this._quorumSatisfied() });
  }

  selfHeal() {
    if (!this.coordinatorId || !this.nodes.has(this.coordinatorId) || this.nodes.get(this.coordinatorId).malicious) {
      return this.electCoordinator();
    }
    return response("self-heal", { coordinatorId: this.coordinatorId, healed: true });
  }

  isByzantineResilient() {
    const total = this.nodes.size;
    if (total === 0) return true;
    const malicious = [...this.nodes.values()].filter((node) => node.malicious).length;
    return malicious / total <= 0.33;
  }

  _quorumSatisfied() {
    const total = this.nodes.size;
    if (total === 0) return false;
    return this.isByzantineResilient();
  }
}

module.exports = {
  AgentNetwork,
};
