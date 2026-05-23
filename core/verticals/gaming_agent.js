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
const { createVerticalAgent } = require("./base");

function createGamingAgent() {
  return createVerticalAgent({
    name: "gaming",
    rules: [
      () => ({ allowed: true, reason: "latency is always optimized" }),
      (action) => ({ allowed: !action.crossRegionMatchmakingPenalty || action.crossRegionMatchmakingPenalty < 50, reason: "minimize matchmaking latency globally" }),
    ],
  });
}

function scaleGameServers(plan) {
  return response("gaming-scale", {
    region: plan.region,
    peakWindow: plan.peakWindow || "launch-or-weekend",
    burstCapable: true,
    statePersistence: true,
    latencyTargetMs: plan.latencyTargetMs || 30,
  });
}

module.exports = {
  createGamingAgent,
  scaleGameServers,
};
