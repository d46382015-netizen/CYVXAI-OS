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

const { entropy } = require("../shared/runtime");
const { response } = require("../shared/attribution");

class EntropyMonitor {
  observe(values) {
    return response("entropy", { shannon: entropy(values), values: values.length });
  }
}

module.exports = { EntropyMonitor };

