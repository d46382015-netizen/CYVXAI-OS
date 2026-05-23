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

class VerticalAgent {
  constructor(profile) {
    this.profile = profile;
    this.history = [];
  }

  validate(action) {
    const checks = this.profile.rules.map((rule) => rule(action));
    const allowed = checks.every((item) => item.allowed);
    const reasons = checks.filter((item) => !item.allowed).map((item) => item.reason);
    return response("vertical-validation", {
      vertical: this.profile.name,
      allowed,
      reasons,
    });
  }

  record(event) {
    const record = {
      at: new Date().toISOString(),
      event,
    };
    this.history.push(record);
    return response("vertical-event", { vertical: this.profile.name, record });
  }
}

function createVerticalAgent(profile) {
  return new VerticalAgent(profile);
}

module.exports = {
  VerticalAgent,
  createVerticalAgent,
};
