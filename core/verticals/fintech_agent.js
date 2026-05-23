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

function createFintechAgent() {
  return createVerticalAgent({
    name: "fintech",
    rules: [
      (action) => ({ allowed: !/delete|terminate/i.test(action.type || ""), reason: "never delete or terminate core financial systems" }),
      (action) => ({ allowed: !action.duringMarketOpen, reason: "maintenance cannot occur during market open" }),
      (action) => ({ allowed: !action.crossBorderDataMove, reason: "regulatory boundaries must be respected" }),
    ],
  });
}

function planMaintenance(schedule) {
  const blocked = Boolean(schedule.duringMarketOpen);
  return response("fintech-plan", {
    allowed: !blocked,
    maintenanceWindow: blocked ? "market-close only" : schedule.window || "after-hours",
    compliance: ["SOX", "PCI-DSS"],
    coLocation: schedule.coLocation || "latency-optimized",
  });
}

module.exports = {
  createFintechAgent,
  planMaintenance,
};
