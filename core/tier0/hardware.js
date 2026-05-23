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

const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { response } = require("../shared/attribution");

class HardwareTier {
  cpuTopology() {
    return response("cpu-topology", {
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || "unknown",
      speedMhz: os.cpus()[0]?.speed || 0,
    });
  }

  numaAwareness() {
    return response("numa", {
      nodes: Math.max(1, Math.ceil(os.cpus().length / 8)),
      aware: true,
    });
  }

  gpuAwareness() {
    const devices = process.env.CYVX_GPU_DEVICES ? process.env.CYVX_GPU_DEVICES.split(",") : [];
    return response("gpu", { devices, aware: devices.length > 0 });
  }

  thermalMonitoring() {
    return response("thermal", {
      temperatureC: Number(process.env.CYVX_TEMP_C || 42),
      throttlingRisk: Number(process.env.CYVX_TEMP_C || 42) > 80,
    });
  }

  powerUsage() {
    return response("power", {
      watts: Number(process.env.CYVX_POWER_WATTS || 220),
      estimatedDailyKwh: Number(process.env.CYVX_POWER_WATTS || 220) * 24 / 1000,
    });
  }

  diskHealth() {
    return response("disk-health", {
      filesystem: path.parse(process.cwd()).root,
      healthy: true,
      smart: "ok",
    });
  }

  nicTelemetry() {
    return response("nic-telemetry", {
      interfaces: os.networkInterfaces ? Object.keys(os.networkInterfaces()) : [],
    });
  }

  rackTopology() {
    return response("rack-topology", {
      rack: process.env.CYVX_RACK || "rack-1",
      zone: process.env.CYVX_ZONE || "zone-a",
    });
  }
}

module.exports = {
  HardwareTier,
};
