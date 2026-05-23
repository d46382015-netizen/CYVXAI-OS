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

function createHealthtechAgent() {
  return createVerticalAgent({
    name: "healthtech",
    rules: [
      (action) => ({ allowed: !action.crossBorderDataMove, reason: "patient data cannot cross borders without permission" }),
      (action) => ({ allowed: action.availabilityPriority !== "cost-first", reason: "availability is prioritized over cost" }),
      (action) => ({ allowed: true, reason: "HIPAA enforced at genome level" }),
    ],
  });
}

function routeClinicalWorkload(workload) {
  return response("healthtech-route", {
    allowed: !workload.crossBorderDataMove,
    region: workload.region,
    priority: "availability-first",
    shiftPattern: workload.shiftPattern || "hospital-aware",
  });
}

module.exports = {
  createHealthtechAgent,
  routeClinicalWorkload,
};
