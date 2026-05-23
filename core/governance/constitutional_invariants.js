/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
"use strict";

const { response } = require("../shared/attribution");

class ConstitutionalInvariants {
  constructor(rules = []) {
    this.rules = rules.length ? rules : [
      "legibility",
      "recoverability",
      "bounded-adaptation",
      "graceful-degradation",
      "operator-trust",
      "failure-containment",
      "epistemic-humility",
      "survivability",
    ];
  }

  evaluate(action) {
    const violations = [];
    if (action.irreversible && !action.confirmed) violations.push("irreversible actions require confirmation");
    if (action.confidence !== undefined && Number(action.confidence) < 0.7) violations.push("confidence below constitutional threshold");
    if (action.crossBorder && !action.explicitPermission) violations.push("cross-border data movement blocked");
    return response("constitutional-evaluation", {
      allowed: violations.length === 0,
      violations,
      invariants: this.rules,
    });
  }
}

module.exports = {
  ConstitutionalInvariants,
};
