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

class ConfidenceGraph {
  constructor() {
    this.nodes = new Map();
  }

  set(id, confidence, reason = "") {
    this.nodes.set(id, { id, confidence: Math.max(0, Math.min(1, confidence)), reason });
    return this.nodes.get(id);
  }

  snapshot() {
    return response("confidence-graph", { nodes: [...this.nodes.values()] });
  }
}

module.exports = { ConfidenceGraph };

