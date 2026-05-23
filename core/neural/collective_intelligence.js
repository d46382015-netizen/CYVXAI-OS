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

const { EventEmitter } = require("events");
const { response } = require("../shared/attribution");

class CollectiveIntelligenceNetwork extends EventEmitter {
  constructor() {
    super();
    this.nodes = new Map();
    this.beliefs = [];
  }

  registerAgent(agent) {
    const record = {
      id: agent.id,
      role: agent.role || "generalist",
      heterodox: Boolean(agent.heterodox),
      lastReasoning: agent.lastReasoning || null,
      updatedAt: new Date().toISOString(),
    };
    this.nodes.set(record.id, record);
    return response("agent-registered", { agent: record });
  }

  broadcastReasoning(agentId, reasoning) {
    const record = {
      agentId,
      reasoning,
      strength: Number(reasoning.strength || 0.5),
      at: new Date().toISOString(),
    };
    this.beliefs.push(record);
    this.emit("reasoning", record);
    return response("reasoning-broadcast", { broadcast: record });
  }

  adoptPatterns() {
    const sorted = [...this.beliefs].sort((a, b) => b.strength - a.strength);
    const sharedHeuristics = sorted.slice(0, 10).map((belief) => belief.reasoning.summary || belief.reasoning);
    return response("collective-adoption", {
      sharedHeuristics,
      culturalHeuristics: sorted.length > 0 ? "emergent" : "none",
      heterodoxPressure: [...this.nodes.values()].some((node) => node.heterodox),
    });
  }
}

module.exports = {
  CollectiveIntelligenceNetwork,
};
