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

class CoalitionFormation {
  shapley(members, valueFn = (coalition) => coalition.length) {
    const total = members.length || 1;
    const credits = members.map((member, index) => ({ member, credit: valueFn(members.slice(0, index + 1)) / total }));
    return response("coalition", { credits, total });
  }
}

module.exports = { CoalitionFormation };

