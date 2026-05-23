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

const STATUSES = Object.freeze([
  "NOT_STARTED",
  "PLANNING",
  "IMPLEMENTING",
  "TESTING",
  "HARDENING",
  "STABLE",
  "EXPERIMENTAL",
  "DEPRECATED",
]);

class StatusModel {
  constructor() {
    this.modules = new Map();
  }

  set(name, status, meta = {}) {
    if (!STATUSES.includes(status)) throw new Error(`invalid status ${status}`);
    const record = {
      name,
      status,
      meta,
      updatedAt: new Date().toISOString(),
    };
    this.modules.set(name, record);
    return record;
  }

  get(name) {
    return this.modules.get(name) || null;
  }

  snapshot() {
    return response("status-model", {
      statuses: STATUSES,
      modules: [...this.modules.values()],
    });
  }
}

module.exports = {
  STATUSES,
  StatusModel,
};
