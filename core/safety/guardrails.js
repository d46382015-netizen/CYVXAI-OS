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

class Guardrails {
  constructor(options = {}) {
    this.costCeiling = options.costCeiling ?? Infinity;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.7;
  }

  evaluate(action) {
    const reasons = [];
    if (/delete/i.test(action.type || "")) reasons.push("never delete data");
    if (/terminate.*database/i.test(action.type || "")) reasons.push("never terminate production databases without human approval");
    if (Number(action.costImpact || 0) > this.costCeiling) reasons.push("single-action cost ceiling exceeded");
    if ((action.predictedSlaBreaches || 0) > 0.001) reasons.push("predicted SLA breach above threshold");
    if (action.crossBorderDataMove && !action.explicitPermission) reasons.push("data cannot move across borders without explicit permission");
    if (action.irreversible && !action.confirmed) reasons.push("irreversible action requires confirmation");
    if (Number(action.confidence || 0) < this.confidenceThreshold) reasons.push("confidence below threshold; ask human");

    return response("guardrail-evaluation", {
      allowed: reasons.length === 0,
      reasons,
      confidenceThreshold: this.confidenceThreshold,
      costCeiling: this.costCeiling,
    });
  }
}

module.exports = {
  Guardrails,
};
