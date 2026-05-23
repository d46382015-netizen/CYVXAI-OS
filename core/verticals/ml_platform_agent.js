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

function createMLPlatformAgent() {
  return createVerticalAgent({
    name: "ml-platform",
    rules: [
      (action) => ({ allowed: true, reason: "GPU utilization is optimized with workload class awareness" }),
      (action) => ({ allowed: !action.preemptInference || action.inferencePriority === "latency-sensitive", reason: "inference can preempt training when needed" }),
    ],
  });
}

function manageGpuCluster(plan) {
  return response("ml-platform-plan", {
    cluster: plan.cluster,
    trainingStrategy: plan.trainingStrategy || "spot-first",
    inferenceStrategy: plan.inferenceStrategy || "on-demand",
    gpuUtilizationTarget: plan.gpuUtilizationTarget || 0.9,
  });
}

module.exports = {
  createMLPlatformAgent,
  manageGpuCluster,
};
