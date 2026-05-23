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

class InvariantChecker {
  constructor(invariants = []) {
    this.invariants = invariants;
  }

  check(state) {
    const violations = [];
    for (const invariant of this.invariants) {
      try {
        if (!invariant(state)) violations.push('invariant_failed');
      } catch (error) {
        violations.push(error.message);
      }
    }
    return { ok: violations.length === 0, violations };
  }
}

module.exports = Object.assign(createSubsystem('formal/invariant_checker', {
  category: 'formal',
  description: 'invariant checker'
}), {
  create: (invariants) => new InvariantChecker(invariants),
  InvariantChecker
});
