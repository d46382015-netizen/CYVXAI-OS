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

class HallucinationBoundary {
  block(estimate = {}) {
    const blocked = Number(estimate.confidence || 0) < 0.7;
    return response("hallucination-boundary", {
      blocked,
      reason: blocked ? "confidence below safe automation threshold" : null,
    });
  }
}

module.exports = { HallucinationBoundary };

