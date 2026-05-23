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

class RootCauseAnalyzer {
  constructor(graph) {
    this.graph = graph;
  }

  trace(symptomId, limitMs = 30000) {
    const started = Date.now();
    const path = [];
    let frontier = [symptomId];
    const seen = new Set(frontier);
    while (frontier.length && Date.now() - started < limitMs) {
      const current = frontier.shift();
      const parents = this.graph.parents(current);
      if (!parents.length) {
        path.push(current);
        break;
      }
      for (const parent of parents) {
        if (!seen.has(parent.from)) {
          seen.add(parent.from);
          frontier.push(parent.from);
        }
      }
      path.push(current);
    }
    const root = path[path.length - 1] || symptomId;
    return response("root-cause", { symptomId, rootCause: root, path, elapsedMs: Date.now() - started });
  }
}

module.exports = { RootCauseAnalyzer };

