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

class PolicyDiffExplainer {
  diff(before = {}, after = {}) {
    const changed = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.push(key);
    }
    return response("policy-diff", { changed, before, after });
  }
}

module.exports = { PolicyDiffExplainer };

