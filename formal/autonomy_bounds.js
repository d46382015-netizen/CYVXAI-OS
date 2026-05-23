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

class AutonomyBounds {
  constructor(bounds = {}) {
    this.bounds = { maxActions: 100, maxRisk: 0.5, ...bounds };
  }

  check(report = {}) {
    const violations = [];
    if ((report.actions || 0) > this.bounds.maxActions) violations.push('maxActions');
    if ((report.risk || 0) > this.bounds.maxRisk) violations.push('maxRisk');
    return { allowed: violations.length === 0, violations };
  }
}

module.exports = Object.assign(createSubsystem('formal/autonomy_bounds', {
  category: 'formal',
  description: 'bounded autonomy'
}), {
  create: (bounds) => new AutonomyBounds(bounds),
  AutonomyBounds
});
