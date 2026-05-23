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

const { response } = require("./shared/attribution");

function buildMetrics(controller) {
  const state = controller.snapshot();
  return response("metrics", {
    agents: state.agents.length,
    evolutionCycles: controller.metrics.evolutionCycles,
    events: controller.metrics.events,
    modules: controller.moduleCount(),
    sensors: controller.modules.perception?.SENSOR_CATALOG?.length || 0,
    revenueStreams: controller.modules.revenue?.streams?.length || 30,
  });
}

module.exports = { buildMetrics };

