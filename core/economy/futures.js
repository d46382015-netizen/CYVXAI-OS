// © 2026 Dakota Lee Jonsgaard
"use strict";

const { response } = require("../shared/attribution");

class ComputeFuturesMarket {
  constructor(options = {}) {
    this.contracts = [];
    this.markets = options.markets || ["30d", "60d", "90d"];
  }

  createContract(contract) {
    const record = {
      id: contract.id || `future_${this.contracts.length + 1}`,
      buyerOrgId: contract.buyerOrgId,
      sellerOrgId: contract.sellerOrgId,
      region: contract.region,
      instanceType: contract.instanceType,
      horizonDays: Number(contract.horizonDays || 30),
      units: Number(contract.units || 0),
      strikePricePerUnit: Number(contract.strikePricePerUnit || 0),
      predictedDemand: contract.predictedDemand ?? null,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    this.contracts.push(record);
    return response("futures-contract", { contract: record });
  }

  tradeOnForecast(contractId, forecast) {
    const contract = this.contracts.find((item) => item.id === contractId);
    if (!contract) {
      return response("futures-trade", { traded: false, reason: "contract-not-found" });
    }
    contract.predictedDemand = forecast.predictedDemand;
    contract.forecastConfidence = clamp(forecast.confidence ?? 0.5, 0, 1);
    contract.edge = forecast.edge ?? null;
    contract.updatedAt = new Date().toISOString();
    return response("futures-trade", { traded: true, contract });
  }

  settle(contractId, spotPricePerUnit) {
    const contract = this.contracts.find((item) => item.id === contractId);
    if (!contract) {
      return response("futures-settlement", { settled: false, reason: "contract-not-found" });
    }
    const spot = Number(spotPricePerUnit || 0);
    const pnl = roundToCents((spot - contract.strikePricePerUnit) * contract.units);
    contract.status = "settled";
    contract.settledAt = new Date().toISOString();
    contract.pnl = pnl;
    return response("futures-settlement", {
      settled: true,
      contract,
      pnl,
      lockInBenefit: roundToCents(Math.abs(pnl)),
    });
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToCents(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  ComputeFuturesMarket,
};
