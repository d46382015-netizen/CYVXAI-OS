/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */

const { createSubsystem, entropy } = require('../core/lib/cyxv');

function computeEntropy(values = []) {
  return entropy(values);
}

module.exports = Object.assign(createSubsystem('thermodynamics/entropy_engine', {
  category: 'thermodynamics',
  description: 'entropy minimization engine'
}), {
  computeEntropy
});
