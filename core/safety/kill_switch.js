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

const { EventEmitter } = require("events");
const { response } = require("../shared/attribution");

class KillSwitch extends EventEmitter {
  constructor() {
    super();
    this.globalPaused = false;
    this.frozenPopulations = new Set();
    this.history = [];
  }

  pauseAll(reason) {
    this.globalPaused = true;
    return this._record("global-pause", { reason });
  }

  freezePopulation(populationId, reason) {
    this.frozenPopulations.add(populationId);
    return this._record("agent-freeze", { populationId, reason });
  }

  rollback(steps) {
    return this._record("rollback", { steps: Number(steps || 1) });
  }

  forensicsMode() {
    return this._record("forensics-mode", {
      capturedState: {
        globalPaused: this.globalPaused,
        frozenPopulations: [...this.frozenPopulations],
      },
    });
  }

  _record(type, data) {
    const record = {
      type,
      data,
      at: new Date().toISOString(),
    };
    this.history.push(record);
    this.emit(type, record);
    return response(type, { action: record, accessibleVia: ["CLI", "API", "Slack", "SMS"] });
  }
}

module.exports = {
  KillSwitch,
};
