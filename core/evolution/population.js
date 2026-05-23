/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
import { Agent } from "./src/agent.js";

export class Population {
  constructor(size = 8) {
    this.size = size;
    this.agents = Array.from({ length: size }, (_, i) => new Agent(`agent-${i + 1}`));
  }

  toJSON() {
    return this.agents.map((agent) => agent.toJSON());
  }
}

