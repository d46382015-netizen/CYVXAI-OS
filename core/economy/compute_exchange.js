// © 2026 Dakota Lee Jonsgaard
"use strict";

const { EventEmitter } = require("events");
const { response } = require("../shared/attribution");

class ComputeExchange extends EventEmitter {
  constructor(options = {}) {
    super();
    this.supply = [];
    this.bids = [];
    this.trades = [];
    this.feeRate = options.feeRate ?? 0.02;
    this.settledRevenue = 0;
  }

  postSupply(supply) {
    const record = {
      id: supply.id || `supply_${this.supply.length + 1}`,
      orgId: supply.orgId,
      region: supply.region,
      instanceType: supply.instanceType,
      capacity: Number(supply.capacity || 0),
      minPricePerUnit: Number(supply.minPricePerUnit || 0),
      expiresAt: supply.expiresAt || null,
      status: "open",
      postedAt: new Date().toISOString(),
    };
    this.supply.push(record);
    this.emit("supply", record);
    return response("supply-posted", { supply: record });
  }

  placeBid(bid) {
    const record = {
      id: bid.id || `bid_${this.bids.length + 1}`,
      orgId: bid.orgId,
      region: bid.region,
      instanceType: bid.instanceType,
      capacity: Number(bid.capacity || 0),
      maxPricePerUnit: Number(bid.maxPricePerUnit || 0),
      durationHours: Number(bid.durationHours || 1),
      status: "open",
      placedAt: new Date().toISOString(),
    };
    this.bids.push(record);
    this.emit("bid", record);
    return response("bid-placed", { bid: record });
  }

  discoverPrice(region, instanceType) {
    const regionSupply = this.supply.filter((item) => item.region === region && item.instanceType === instanceType && item.status === "open");
    const regionDemand = this.bids.filter((item) => item.region === region && item.instanceType === instanceType && item.status === "open");
    const supplyQty = regionSupply.reduce((sum, item) => sum + item.capacity, 0);
    const demandQty = regionDemand.reduce((sum, item) => sum + item.capacity, 0);

    const base = regionSupply.length > 0
      ? average(regionSupply.map((item) => item.minPricePerUnit))
      : average(regionDemand.map((item) => item.maxPricePerUnit)) || 1;

    const pressure = demandQty === 0 ? 0 : demandQty / Math.max(supplyQty, 1);
    const price = roundToCents(base * (1 + Math.max(0, pressure - 1) * 0.35));

    return response("price-discovery", {
      region,
      instanceType,
      supplyQty,
      demandQty,
      pricePerUnit: price,
      pressure,
    });
  }

  match() {
    const matches = [];
    const openBids = this.bids.filter((bid) => bid.status === "open");
    const openSupply = this.supply.filter((supply) => supply.status === "open");

    for (const bid of openBids) {
      for (const supply of openSupply) {
        if (bid.region !== supply.region || bid.instanceType !== supply.instanceType) continue;
        if (bid.maxPricePerUnit < supply.minPricePerUnit) continue;

        const quantity = Math.min(bid.capacity, supply.capacity);
        if (quantity <= 0) continue;

        const clearing = this.discoverPrice(bid.region, bid.instanceType).data.pricePerUnit;
        const trade = {
          id: `trade_${this.trades.length + 1}`,
          buyerOrgId: bid.orgId,
          sellerOrgId: supply.orgId,
          region: bid.region,
          instanceType: bid.instanceType,
          quantity,
          durationHours: bid.durationHours,
          pricePerUnit: clearing,
          grossValue: roundToCents(quantity * clearing * bid.durationHours),
          feeRate: this.feeRate,
          feeAmount: roundToCents(quantity * clearing * bid.durationHours * this.feeRate),
          netToSeller: 0,
          createdAt: new Date().toISOString(),
        };
        trade.netToSeller = roundToCents(trade.grossValue - trade.feeAmount);
        this.trades.push(trade);
        matches.push(trade);

        bid.capacity -= quantity;
        supply.capacity -= quantity;
        if (bid.capacity <= 0) bid.status = "filled";
        if (supply.capacity <= 0) supply.status = "filled";
      }
    }

    return response("matches", { trades: matches });
  }

  settle(tradeId) {
    const trade = this.trades.find((item) => item.id === tradeId);
    if (!trade) {
      return response("settlement", { settled: false, reason: "trade-not-found" });
    }
    if (trade.settledAt) {
      return response("settlement", { settled: true, trade });
    }
    trade.settledAt = new Date().toISOString();
    this.settledRevenue += trade.feeAmount;
    return response("settlement", {
      settled: true,
      trade,
      creatorRoyalty: roundToCents(trade.feeAmount),
      creator: "Dakota Lee Jonsgaard",
    });
  }

  revenueSummary() {
    return response("revenue-summary", {
      transactions: this.trades.length,
      grossValue: roundToCents(this.trades.reduce((sum, trade) => sum + trade.grossValue, 0)),
      feesCollected: roundToCents(this.settledRevenue),
      creatorRoyaltyRate: this.feeRate,
    });
  }
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundToCents(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  ComputeExchange,
};
