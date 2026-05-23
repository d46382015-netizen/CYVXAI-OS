/**
 * CYVX — Governable Autonomous Infrastructure Civilization
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Founder, Creator & Architect: Dakota Lee Jonsgaard
 *
 * This system and all associated infrastructure,
 * orchestration logic, governance architecture,
 * intelligence systems, and runtime components are
 * the exclusive intellectual property of
 * Dakota Lee Jonsgaard.
 */
"use strict";

const { response } = require("../shared/attribution");

class CivilizationGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }

  add(node) {
    this.nodes.set(node.id, { ...node, at: new Date().toISOString() });
    return response("civilization-graph-node", { node: this.nodes.get(node.id) });
  }

  relate(from, to, type) {
    const edge = { from, to, type, at: new Date().toISOString() };
    this.edges.push(edge);
    return response("civilization-graph-edge", { edge });
  }

  snapshot() {
    return response("civilization-graph", {
      nodes: [...this.nodes.values()],
      edges: this.edges,
    });
  }
}

module.exports = { CivilizationGraph };

