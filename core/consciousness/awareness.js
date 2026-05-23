// © 2026 Dakota Lee Jonsgaard
"use strict";

const { EventEmitter } = require("events");
const { response, withAttribution } = require("../shared/attribution");

class AwarenessLayer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.clusters = new Map();
    this.regions = new Map();
    this.businessEvents = [];
    this.trafficSignals = [];
    this.competitorSignals = [];
    this.history = [];
    this.options = {
      regionTimeZoneOffsetMinutes: 0,
      ...options,
    };
  }

  registerCluster(cluster) {
    const record = {
      id: cluster.id,
      name: cluster.name || cluster.id,
      region: cluster.region || "unknown",
      state: cluster.state || "healthy",
      capacity: cluster.capacity || {},
      updatedAt: new Date().toISOString(),
      metadata: cluster.metadata || {},
    };
    this.clusters.set(record.id, record);
    this.history.push({ kind: "cluster", record });
    this.emit("cluster", record);
    return withAttribution(record);
  }

  registerRegion(region) {
    const record = {
      region: region.region,
      localTime: region.localTime || this._localTime(region.offsetMinutes),
      businessDay: Boolean(region.businessDay),
      demandLevel: region.demandLevel || "unknown",
      weather: region.weather || "unknown",
      updatedAt: new Date().toISOString(),
    };
    this.regions.set(record.region, record);
    this.history.push({ kind: "region", record });
    this.emit("region", record);
    return withAttribution(record);
  }

  addBusinessEvent(event) {
    const record = {
      name: event.name,
      type: event.type || "business",
      region: event.region || "global",
      startsAt: event.startsAt || null,
      confidence: clamp(event.confidence ?? 0.8, 0, 1),
      source: event.source || "inferred",
      updatedAt: new Date().toISOString(),
    };
    this.businessEvents.push(record);
    this.history.push({ kind: "businessEvent", record });
    this.emit("businessEvent", record);
    return withAttribution(record);
  }

  ingestTrafficSignal(signal) {
    const record = {
      service: signal.service,
      region: signal.region || "global",
      direction: signal.direction || "up",
      magnitude: signal.magnitude || 0,
      latencyP95Ms: signal.latencyP95Ms ?? null,
      errorRate: signal.errorRate ?? null,
      updatedAt: new Date().toISOString(),
    };
    this.trafficSignals.push(record);
    this.history.push({ kind: "traffic", record });
    this.emit("traffic", record);
    return withAttribution(record);
  }

  ingestCompetitorSignal(signal) {
    const record = {
      competitor: signal.competitor,
      signal: signal.signal,
      strength: clamp(signal.strength ?? 0.5, 0, 1),
      source: signal.source || "public",
      updatedAt: new Date().toISOString(),
    };
    this.competitorSignals.push(record);
    this.history.push({ kind: "competitor", record });
    this.emit("competitor", record);
    return withAttribution(record);
  }

  inferWorldModel() {
    const hotRegions = [...this.regions.values()].filter((region) => region.demandLevel === "high" || region.businessDay);
    const stressRegions = [...this.clusters.values()].filter((cluster) => cluster.state !== "healthy");
    const trafficSummary = summarizeTraffic(this.trafficSignals);
    const hypotheses = [];

    for (const signal of this.trafficSignals) {
      if (signal.service === "payment" && signal.magnitude >= 8) {
        hypotheses.push({
          pattern: "flash-sale",
          why: "payment traffic is spiking sharply",
          confidence: 0.86,
        });
      }
      if (signal.service === "inventory" && signal.magnitude >= 8) {
        hypotheses.push({
          pattern: "launch-or-sale",
          why: "inventory traffic is rising in parallel with commerce systems",
          confidence: 0.79,
        });
      }
      if (signal.service === "database" && signal.serviceName === "user" && signal.magnitude >= 7) {
        hypotheses.push({
          pattern: "viral-moment",
          why: "user table reads are accelerating beyond baseline",
          confidence: 0.84,
        });
      }
    }

    return response("world-model", {
      clusters: [...this.clusters.values()],
      regions: [...this.regions.values()],
      businessEvents: [...this.businessEvents],
      trafficSummary,
      hotRegions,
      stressRegions,
      competitorSignals: [...this.competitorSignals],
      hypotheses: dedupeByPattern(hypotheses),
      explanation: this.explainState(hypotheses, hotRegions, stressRegions),
    });
  }

  explainState(hypotheses, hotRegions, stressRegions) {
    const reasons = [];
    if (hypotheses.length > 0) {
      reasons.push(`The current infrastructure pattern suggests ${hypotheses.map((h) => h.pattern).join(", ")}.`);
    }
    if (hotRegions.length > 0) {
      reasons.push(`Demand is concentrated in ${hotRegions.map((r) => r.region).join(", ")}.`);
    }
    if (stressRegions.length > 0) {
      reasons.push(`Operational stress is visible in ${stressRegions.map((c) => c.id).join(", ")}.`);
    }
    if (reasons.length === 0) {
      reasons.push("The system sees no strong anomaly; conditions are broadly stable.");
    }
    return reasons.join(" ");
  }

  snapshot() {
    return response("awareness-snapshot", {
      clusters: [...this.clusters.values()],
      regions: [...this.regions.values()],
      businessEvents: [...this.businessEvents],
      trafficSignals: [...this.trafficSignals],
      competitorSignals: [...this.competitorSignals],
      historySize: this.history.length,
    });
  }

  _localTime(offsetMinutes) {
    const offset = Number.isFinite(offsetMinutes) ? offsetMinutes : this.options.regionTimeZoneOffsetMinutes;
    const now = new Date(Date.now() + offset * 60 * 1000);
    return now.toISOString();
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function summarizeTraffic(signals) {
  const byService = new Map();
  for (const signal of signals) {
    const current = byService.get(signal.service) || { service: signal.service, magnitude: 0, count: 0 };
    current.magnitude += signal.magnitude || 0;
    current.count += 1;
    byService.set(signal.service, current);
  }
  return [...byService.values()];
}

function dedupeByPattern(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.pattern)) return false;
    seen.add(item.pattern);
    return true;
  });
}

module.exports = {
  AwarenessLayer,
};
