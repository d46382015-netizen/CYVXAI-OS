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

class IrreversibleActionGuard {
  check(action) {
    const blocked = Boolean(action.irreversible) && !Boolean(action.confirmed);
    return response("irreversible-guard", {
      blocked,
      reason: blocked ? "irreversible action requires explicit confirmation" : null,
    });
  }
}

module.exports = { IrreversibleActionGuard };

