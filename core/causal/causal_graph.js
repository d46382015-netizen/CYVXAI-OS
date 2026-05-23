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

class CausalGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
  }

  addNode(id, data = {}) {
    this.nodes.set(id, { id, ...data });
    if (!this.edges.has(id)) this.edges.set(id, new Set());
    return this.nodes.get(id);
  }

  addEdge(from, to, weight = 1) {
    this.addNode(from);
    this.addNode(to);
    this.edges.get(from).add({ to, weight });
    return { from, to, weight };
  }

  parents(nodeId) {
    const parents = [];
    for (const [from, outgoing] of this.edges.entries()) {
      for (const edge of outgoing) if (edge.to === nodeId) parents.push({ from, ...edge });
    }
    return parents;
  }

  ancestors(nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);
    const direct = this.parents(nodeId);
    return direct.flatMap((edge) => [edge.from, ...this.ancestors(edge.from, visited)]);
  }

  snapshot() {
    return response("causal-graph", {
      nodes: [...this.nodes.values()],
      edges: [...this.edges.entries()].flatMap(([from, set]) => [...set].map((edge) => ({ from, ...edge }))),
    });
  }
}

module.exports = { CausalGraph };

