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

class EntanglementSync {
  correlate(clusters) {
    const pairs = [];
    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        pairs.push({
          a: clusters[i].id,
          b: clusters[j].id,
          correlation: similarity(clusters[i], clusters[j]),
        });
      }
    }
    return response("entanglement-sync", { pairs: pairs.sort((a, b) => b.correlation - a.correlation) });
  }
}

function similarity(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  let matches = 0;
  for (const key of keys) if (JSON.stringify(a?.[key]) === JSON.stringify(b?.[key])) matches += 1;
  return keys.size ? matches / keys.size : 0;
}

module.exports = { EntanglementSync };

