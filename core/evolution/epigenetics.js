/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
import attribution from "../shared/attribution.js";

const { response } = attribution;

export class EpigeneticRegulator {
  constructor() {
    this.states = new Map();
  }

  express(genome, environment = {}) {
    const expression = {};
    const env = {
      load: environment.load || "normal",
      traffic: environment.traffic || "normal",
      securityIncident: Boolean(environment.securityIncident),
      costPressure: environment.costPressure || "normal",
    };

    for (const [gene, value] of Object.entries(genome)) {
      expression[gene] = this._expressGene(gene, value, env);
    }

    const record = { expression, env, updatedAt: new Date().toISOString() };
    this.states.set(environment.id || "default", record);
    return response("epigenetic-expression", record);
  }

  _expressGene(gene, value, env) {
    if (env.securityIncident && /security|guard|isolation/i.test(gene)) return boost(value);
    if ((env.load === "high" || env.traffic === "high") && /perf|latency|throughput|reliab/i.test(gene)) return boost(value);
    if ((env.load === "low" || env.costPressure === "high") && /cost|efficiency|budget/i.test(gene)) return boost(value);
    if (/cost|budget/i.test(gene) && env.load === "high") return suppress(value);
    if (/perf|latency|throughput/i.test(gene) && env.costPressure === "high") return suppress(value);
    return value;
  }

  persistState(id) {
    return this.states.get(id || "default") || null;
  }
}

function boost(value) {
  if (typeof value === "number") return value * 1.15;
  if (typeof value === "boolean") return true;
  return value;
}

function suppress(value) {
  if (typeof value === "number") return value * 0.85;
  if (typeof value === "boolean") return false;
  return value;
}
