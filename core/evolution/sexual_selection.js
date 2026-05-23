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

export class SexualSelectionArena {
  constructor() {
    this.broadcasters = [];
    this.matings = [];
  }

  broadcastFitness(agent) {
    const record = {
      id: agent.id,
      fitness: Number(agent.fitness || 0),
      traits: agent.traits || [],
      specialization: agent.specialization || "generalist",
      broadcastAt: new Date().toISOString(),
    };
    this.broadcasters.push(record);
    return response("fitness-broadcast", { agent: record });
  }

  chooseMate(agent, candidates) {
    const scored = candidates.map((candidate) => ({
      candidate,
      compatibility: compatibilityScore(agent, candidate),
    })).sort((a, b) => b.compatibility - a.compatibility);

    const mate = scored[0]?.candidate || null;
    const offspringProfile = mate ? blendProfiles(agent, mate) : null;
    const record = {
      agentId: agent.id,
      mateId: mate ? mate.id : null,
      compatibility: scored[0]?.compatibility || 0,
      offspringProfile,
      chosenAt: new Date().toISOString(),
    };
    this.matings.push(record);
    return response("mate-selection", { selection: record });
  }
}

function compatibilityScore(a, b) {
  const traitsA = new Set(a.traits || []);
  const traitsB = new Set(b.traits || []);
  let overlap = 0;
  for (const trait of traitsA) {
    if (traitsB.has(trait)) overlap += 1;
  }
  const complement = (a.specialization || "") !== (b.specialization || "") ? 1 : 0;
  return overlap + complement + Math.min((a.fitness || 0), (b.fitness || 0)) / 10;
}

function blendProfiles(a, b) {
  return {
    strengths: [...new Set([...(a.traits || []), ...(b.traits || [])])],
    balance: `${a.specialization || "generalist"}+${b.specialization || "generalist"}`,
  };
}
