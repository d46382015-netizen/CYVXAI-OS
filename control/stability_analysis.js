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

function stabilityScore(series = []) {
  if (!series.length) return 1;
  const mean = series.reduce((sum, x) => sum + x, 0) / series.length;
  const variance = series.reduce((sum, x) => sum + (x - mean) ** 2, 0) / series.length;
  return Math.max(0, 1 - Math.min(1, variance));
}

module.exports = Object.assign(createSubsystem('control/stability_analysis', {
  category: 'control',
  description: 'stability analysis'
}), {
  stabilityScore
});
