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

function stabilityLandscape(paths = []) {
  return paths.map((path) => ({ path, stability: path.risk ? 1 - path.risk : 0.5 }));
}

module.exports = Object.assign(createSubsystem('futures/stability_landscape', {
  category: 'futures',
  description: 'stability landscape'
}), {
  stabilityLandscape
});
