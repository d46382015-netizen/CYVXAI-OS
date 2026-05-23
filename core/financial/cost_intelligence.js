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

class CostIntelligence {
  analyze(requests = []) {
    const byCustomer = groupSum(requests, "customerId", "cost");
    const byFeature = groupSum(requests, "feature", "cost");
    const total = requests.reduce((sum, req) => sum + Number(req.cost || 0), 0);
    return response("cost-intelligence", {
      perRequest: requests.map((r) => ({ id: r.id, cost: r.cost })),
      costPerCustomer: byCustomer,
      costPerFeature: byFeature,
      totalCost: total,
      waste: requests.filter((r) => r.idle).length,
    });
  }
}

function groupSum(items, key, valueKey) {
  return items.reduce((acc, item) => {
    const group = item[key] || "unknown";
    acc[group] = (acc[group] || 0) + Number(item[valueKey] || 0);
    return acc;
  }, {});
}

module.exports = { CostIntelligence };

