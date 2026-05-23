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

class NashOptimizer {
  allocate(players, resourceTotal) {
    const totalWeight = players.reduce((sum, p) => sum + Number(p.utility || 1), 0) || 1;
    const allocation = players.map((player) => ({
      playerId: player.id,
      allocation: (Number(player.utility || 1) / totalWeight) * resourceTotal,
    }));
    return response("nash-allocation", { allocation, equilibrium: true });
  }
}

module.exports = { NashOptimizer };

