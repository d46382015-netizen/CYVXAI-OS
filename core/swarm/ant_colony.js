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

class AntColony {
  route(graph, start, end) {
    const path = [start];
    let current = start;
    while (current !== end) {
      const neighbors = graph[current] || [];
      if (!neighbors.length) break;
      const next = neighbors.sort((a, b) => (b.pheromone || 0) - (a.pheromone || 0))[0];
      current = next.to;
      if (path.includes(current)) break;
      path.push(current);
    }
    return response("ant-colony", { path, reached: current === end });
  }
}

module.exports = { AntColony };

