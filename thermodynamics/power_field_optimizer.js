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

function optimizePowerField(field = []) {
  return field.slice().sort((a, b) => (a.cost || 0) - (b.cost || 0));
}

module.exports = Object.assign(createSubsystem('thermodynamics/power_field_optimizer', {
  category: 'thermodynamics',
  description: 'power field optimization'
}), {
  optimizePowerField
});
