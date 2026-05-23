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

class Stigmergy {
  constructor() {
    this.pheromones = new Map();
  }

  deposit(key, intensity = 1) {
    this.pheromones.set(key, (this.pheromones.get(key) || 0) + intensity);
    return response("stigmergy", { key, intensity: this.pheromones.get(key) });
  }

  evaporate(rate = 0.1) {
    for (const [key, value] of this.pheromones.entries()) {
      const next = Math.max(0, value * (1 - rate));
      this.pheromones.set(key, next);
    }
    return response("stigmergy-evaporate", { pheromones: [...this.pheromones.entries()] });
  }
}

module.exports = { Stigmergy };

