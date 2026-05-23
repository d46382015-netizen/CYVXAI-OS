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

function detectOscillation(series = []) {
  if (series.length < 4) return { oscillating: false, score: 0 };
  let flips = 0;
  for (let i = 2; i < series.length; i += 1) {
    const a = series[i - 1] - series[i - 2];
    const b = series[i] - series[i - 1];
    if (a === 0 || b === 0) continue;
    if (Math.sign(a) !== Math.sign(b)) flips += 1;
  }
  const score = flips / (series.length - 2);
  return { oscillating: score > 0.4, score };
}

module.exports = Object.assign(createSubsystem('control/oscillation_detector', {
  category: 'control',
  description: 'oscillation detector'
}), {
  detectOscillation
});
