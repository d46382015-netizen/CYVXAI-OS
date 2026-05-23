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

const { response } = require("../shared/attribution");

class InfrastructureKG {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }

  upsert(node) {
    this.nodes.set(node.id, { ...node, updatedAt: new Date().toISOString() });
    return response("kg-node", { node: this.nodes.get(node.id) });
  }

  relate(from, to, relation) {
    this.edges.push({ from, to, relation, at: new Date().toISOString() });
    return response("kg-edge", { from, to, relation });
  }

  snapshot() {
    return response("knowledge-graph", { nodes: [...this.nodes.values()], edges: this.edges });
  }
}

module.exports = { InfrastructureKG };

