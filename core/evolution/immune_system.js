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

export class EvolutionaryImmuneSystem {
  constructor() {
    this.badPatterns = new Set();
    this.quarantinedAgents = new Set();
    this.memory = [];
  }

  evaluate(agent) {
    const failureRate = Number(agent.failureRate || 0);
    const badGenomeSignature = agent.genomeSignature || null;
    const suspicious = failureRate >= 0.6 || this.badPatterns.has(badGenomeSignature);

    if (suspicious && !agent.highPerforming) {
      this.quarantinedAgents.add(agent.id);
      if (badGenomeSignature) this.badPatterns.add(badGenomeSignature);
      this.memory.push({ agentId: agent.id, reason: "consistent-bad-decisions", at: new Date().toISOString() });
    }

    return response("immune-evaluation", {
      agentId: agent.id,
      quarantined: this.quarantinedAgents.has(agent.id),
      immuneMemory: [...this.badPatterns],
    });
  }

  vaccinate(failureType) {
    this.badPatterns.add(failureType);
    return response("immune-vaccination", {
      failureType,
      protectedPopulation: "entire-population",
    });
  }

  release(agentId) {
    this.quarantinedAgents.delete(agentId);
    return response("immune-release", { agentId, released: true });
  }
}
