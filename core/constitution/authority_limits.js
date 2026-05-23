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

class AuthorityLimits {
  constructor() {
    this.levels = ["operator", "lead", "manager", "governor", "owner"];
  }

  levelFor(action = {}) {
    const level = action.level || (action.irreversible ? "owner" : "operator");
    return response("authority-limit", {
      level,
      allowed: this.levels.includes(level),
      hierarchy: this.levels,
    });
  }
}

module.exports = { AuthorityLimits };

