/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */

const { createSubsystem, hash, now } = require('../core/lib/cyxv');

class TreatyGraph {
  constructor() {
    this.edges = [];
  }

  link(a, b, meta = {}) {
    const edge = { id: hash({ a, b, meta, at: now() }), a, b, meta, at: now() };
    this.edges.push(edge);
    return edge;
  }
}

module.exports = Object.assign(createSubsystem('civilization/treaty_graph', {
  category: 'civilization',
  description: 'treaty graph'
}), {
  create: () => new TreatyGraph(),
  TreatyGraph
});
