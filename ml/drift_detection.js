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

function detectDrift(baseline = [], current = []) {
  if (!baseline.length || !current.length) return { drift: 0, detected: false };
  const mean = (xs) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const drift = Math.abs(mean(baseline) - mean(current));
  return { drift, detected: drift > 0.1 };
}

module.exports = Object.assign(createSubsystem('ml/drift_detection', {
  category: 'ml',
  description: 'model drift detection'
}), {
  detectDrift
});
