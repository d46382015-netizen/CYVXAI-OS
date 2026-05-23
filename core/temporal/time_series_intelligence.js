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

const { mean, quantile } = require("../shared/runtime");
const { response } = require("../shared/attribution");

class TimeSeriesIntelligence {
  regimes(series) {
    const split = Math.floor(series.length / 2);
    const first = series.slice(0, split);
    const second = series.slice(split);
    return response("regimes", {
      before: { mean: mean(first), p95: quantile(first, 0.95) },
      after: { mean: mean(second), p95: quantile(second, 0.95) },
      granger: this.granger(series),
    });
  }

  granger(series) {
    const diffs = series.slice(1).map((v, i) => v - series[i]);
    return { causalityScore: Math.min(1, Math.abs(mean(diffs)) / (quantile(series, 0.95) || 1)) };
  }
}

module.exports = { TimeSeriesIntelligence };

