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

const { entropy } = require("../shared/runtime");
const { response } = require("../shared/attribution");

class DependencyEntropy {
  measure(dependencies = []) {
    const labels = dependencies.map((d) => d.service || d.name || String(d));
    return response("dependency-entropy", { entropy: entropy(labels), count: labels.length });
  }
}

module.exports = { DependencyEntropy };

