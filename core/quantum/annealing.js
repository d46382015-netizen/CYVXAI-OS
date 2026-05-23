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

class Annealer {
  anneal(initialPlan, scoreFn, options = {}) {
    let current = clone(initialPlan);
    let best = clone(current);
    let temperature = options.temperature ?? 10;
    const cooling = options.cooling ?? 0.97;
    const iterations = options.iterations ?? 250;
    for (let i = 0; i < iterations; i++) {
      const next = mutatePlan(current);
      const delta = scoreFn(next) - scoreFn(current);
      if (delta > 0 || Math.exp(delta / Math.max(0.001, temperature)) > Math.random()) current = next;
      if (scoreFn(current) > scoreFn(best)) best = clone(current);
      temperature *= cooling;
    }
    return response("annealing", { bestPlan: best, score: scoreFn(best), iterations });
  }
}

function mutatePlan(plan) {
  const copy = clone(plan);
  if (Array.isArray(copy)) return copy.sort(() => Math.random() - 0.5);
  if (copy && typeof copy === "object") {
    const keys = Object.keys(copy);
    if (keys.length) {
      const key = keys[Math.floor(Math.random() * keys.length)];
      if (typeof copy[key] === "number") copy[key] *= 0.95 + Math.random() * 0.1;
    }
  }
  return copy;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { Annealer };

