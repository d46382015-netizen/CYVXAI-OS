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

class GameTheoreticAttacker {
  minimax(defenses, attacks) {
    let best = null;
    let bestScore = -Infinity;
    for (const attack of attacks) {
      const defenseScore = defenses.reduce((score, defense) => score + (defense.counters?.includes(attack.type) ? 1 : 0), 0);
      const score = attack.impact - defenseScore;
      if (score > bestScore) {
        bestScore = score;
        best = attack;
      }
    }
    return response("minimax", { attack: best, robustnessScore: -bestScore });
  }
}

module.exports = { GameTheoreticAttacker };

