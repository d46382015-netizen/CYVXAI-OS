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

class Flocking {
  coordinate(agents) {
    const center = agents.reduce((acc, agent) => {
      acc.x += agent.x || 0;
      acc.y += agent.y || 0;
      return acc;
    }, { x: 0, y: 0 });
    center.x /= Math.max(1, agents.length);
    center.y /= Math.max(1, agents.length);
    return response("flocking", {
      center,
      separation: agents.map((agent) => ({ id: agent.id, distance: distance(agent, center) })),
    });
  }
}

function distance(agent, center) {
  return Math.sqrt(((agent.x || 0) - center.x) ** 2 + ((agent.y || 0) - center.y) ** 2);
}

module.exports = { Flocking };

