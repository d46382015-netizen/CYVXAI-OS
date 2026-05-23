/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */

const { createSubsystem } = require('../core/lib/cyxv');

class FairnessEngine {
  constructor() {
    this.weights = new Map();
  }

  setWeight(tenant, weight = 1) {
    this.weights.set(tenant, Math.max(0.1, weight));
  }

  score(tenant, demand = 1) {
    const weight = this.weights.get(tenant) || 1;
    return demand / weight;
  }
}

module.exports = Object.assign(createSubsystem('scheduler/fairness_engine', {
  category: 'scheduler',
  description: 'fairness engine'
}), {
  create: () => new FairnessEngine(),
  FairnessEngine
});
