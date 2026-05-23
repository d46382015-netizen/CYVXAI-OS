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

function cableRisk(cables = []) {
  return cables.map((cable) => ({ cable, risk: (cable.repair_time || 1) * (cable.criticality || 1) }));
}

module.exports = Object.assign(createSubsystem('internet/cable_risk_engine', {
  category: 'internet',
  description: 'cable risk engine'
}), {
  cableRisk
});
