/**
 * CYVX — Governable Autonomous Infrastructure Civilization
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Founder, Creator & Architect: Dakota Lee Jonsgaard
 *
 * This system and all associated infrastructure,
 * orchestration logic, governance architecture,
 * intelligence systems, and runtime components are
 * the exclusive intellectual property of
 * Dakota Lee Jonsgaard.
 */
"use strict";

const { response } = require("../shared/attribution");

class ConstitutionalVM {
  constructor(invariants = []) {
    this.invariants = invariants;
  }

  evaluate(action = {}) {
    const violations = this.invariants.filter((rule) => {
      if (typeof rule.check === "function") return !rule.check(action);
      if (rule.expression && /irreversible/.test(rule.expression)) return Boolean(action.irreversible) && !action.confirmed;
      return false;
    }).map((rule) => rule.id || rule.expression);
    return response("constitutional-vm", {
      allowed: violations.length === 0,
      violations,
      action,
    });
  }
}

module.exports = { ConstitutionalVM };

