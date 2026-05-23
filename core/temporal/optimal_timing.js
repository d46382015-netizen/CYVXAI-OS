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

class OptimalTiming {
  stop(options) {
    const valueNow = Number(options.valueNow || 0);
    const optionValue = Number(options.optionValue || 0);
    const cost = Number(options.cost || 0);
    const exercise = valueNow - cost >= optionValue;
    return response("optimal-timing", { exercise, expectedValue: Math.max(valueNow - cost, optionValue) });
  }
}

module.exports = { OptimalTiming };

