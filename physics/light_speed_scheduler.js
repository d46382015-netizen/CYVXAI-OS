/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */

const { createSubsystem } = require('../core/lib/cyxv');

function scheduleAtLightSpeed(tasks = []) {
  return tasks.slice().sort((a, b) => (a.latency || 0) - (b.latency || 0));
}

module.exports = Object.assign(createSubsystem('physics/light_speed_scheduler', {
  category: 'physics',
  description: 'light speed aware scheduler'
}), {
  scheduleAtLightSpeed
});
