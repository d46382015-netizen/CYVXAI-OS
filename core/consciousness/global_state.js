// © 2026 Dakota Lee Jonsgaard
"use strict";

const { EventEmitter } = require("events");
const { response } = require("../shared/attribution");

class GlobalState extends EventEmitter {
  constructor(options = {}) {
    super();
    this.deployments = new Map();
    this.snapshots = [];
    this.broadcastIntervalMs = options.broadcastIntervalMs || 60_000;
    this.timer = null;
  }

  upsertDeployment(deployment) {
    const record = {
      id: deployment.id,
      region: deployment.region,
      instanceType: deployment.instanceType,
      pricePerHour: deployment.pricePerHour ?? null,
      reclaimRate: deployment.reclaimRate ?? null,
      stressLevel: deployment.stressLevel ?? 0,
      updatedAt: new Date().toISOString(),
    };
    this.deployments.set(record.id, record);
    return response("deployment-upserted", { deployment: record });
  }

  computeWorldState() {
    const deployments = [...this.deployments.values()];
    const stressRegions = deployments.filter((deployment) => deployment.stressLevel >= 0.7).map((deployment) => deployment.region);
    const cheapest = [...deployments]
      .filter((deployment) => Number.isFinite(deployment.pricePerHour))
      .sort((a, b) => a.pricePerHour - b.pricePerHour)[0] || null;
    const reclaimHotspots = deployments
      .filter((deployment) => Number.isFinite(deployment.reclaimRate) && deployment.reclaimRate >= 0.3)
      .map((deployment) => deployment.instanceType);

    return response("global-state", {
      deployments,
      stressRegions: uniq(stressRegions),
      reclaimHotspots: uniq(reclaimHotspots),
      cheapestCompute: cheapest,
    });
  }

  broadcast() {
    const state = this.computeWorldState();
    const record = {
      at: new Date().toISOString(),
      state,
    };
    this.snapshots.push(record);
    this.emit("broadcast", record);
    return response("broadcast", record);
  }

  startBroadcasts() {
    if (this.timer) return this.timer;
    this.timer = setInterval(() => this.broadcast(), this.broadcastIntervalMs);
    this.timer.unref?.();
    return this.timer;
  }

  stopBroadcasts() {
    if (!this.timer) return false;
    clearInterval(this.timer);
    this.timer = null;
    return true;
  }
}

function uniq(values) {
  return [...new Set(values)];
}

module.exports = {
  GlobalState,
};
