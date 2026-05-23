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

const { EventEmitter } = require("node:events");
const { clamp, mean, zScore } = require("../shared/runtime");
const { response } = require("../shared/attribution");

const SENSOR_CATALOG = [
  // Network
  "tcp_retransmits", "bgp_route_flaps", "dns_latency", "tls_handshake", "mtu_black_holes",
  "anycast_quality", "inter_dc_bandwidth", "network_jitter", "arp_exhaustion", "ecmp_entropy",
  // Compute
  "cpu_steal", "numa_imbalance", "branch_mispredict", "l3_cache_miss", "cpu_throttle",
  "context_switch_rate", "interrupt_coalescing", "huge_page_utilization", "cpu_wait_io", "run_queue",
  // Storage
  "io_queue_depth", "write_amplification", "disk_seek", "raid_rebuild", "filesystem_fragmentation",
  "block_error_rate", "nvme_wear", "object_hot_prefix", "backup_trend", "snapshot_growth",
  // Application
  "gc_pause", "db_pool_saturation", "cache_hit_rate", "queue_depth", "api_latency_p95",
  "error_rate_by_type", "retry_rate", "circuit_breaker", "feature_flag_rate", "ab_test_impact",
  // Business
  "revenue_per_request", "cart_abandonment", "session_length", "api_monetization", "sla_exposure",
  "churn_signal", "support_ticket_rate", "nps_trend", "payment_success_rate", "conversion_velocity",
];

const SENSOR_META = {
  tcp_retransmits: { category: "network", direction: "up", unit: "rate" },
  bgp_route_flaps: { category: "network", direction: "up", unit: "events" },
  dns_latency: { category: "network", direction: "up", unit: "ms" },
  tls_handshake: { category: "network", direction: "up", unit: "ms" },
  mtu_black_holes: { category: "network", direction: "up", unit: "count" },
  anycast_quality: { category: "network", direction: "down", unit: "score" },
  inter_dc_bandwidth: { category: "network", direction: "up", unit: "pct" },
  network_jitter: { category: "network", direction: "up", unit: "ms" },
  arp_exhaustion: { category: "network", direction: "up", unit: "pct" },
  ecmp_entropy: { category: "network", direction: "down", unit: "entropy" },
  cpu_steal: { category: "compute", direction: "up", unit: "pct" },
  numa_imbalance: { category: "compute", direction: "up", unit: "score" },
  branch_mispredict: { category: "compute", direction: "up", unit: "rate" },
  l3_cache_miss: { category: "compute", direction: "up", unit: "rate" },
  cpu_throttle: { category: "compute", direction: "up", unit: "events" },
  context_switch_rate: { category: "compute", direction: "up", unit: "rate" },
  interrupt_coalescing: { category: "compute", direction: "down", unit: "efficiency" },
  huge_page_utilization: { category: "compute", direction: "up", unit: "pct" },
  cpu_wait_io: { category: "compute", direction: "up", unit: "pct" },
  run_queue: { category: "compute", direction: "up", unit: "length" },
};

for (const name of SENSOR_CATALOG) {
  if (!SENSOR_META[name]) {
    SENSOR_META[name] = { category: metaCategory(name), direction: /rate|depth|latency|error|ab_test|churn|support|cart/.test(name) ? "up" : "down", unit: "score" };
  }
}

class SensorHub extends EventEmitter {
  constructor(source = {}) {
    super();
    this.source = source;
    this.history = new Map();
  }

  read(sensorName, source = this.source) {
    const meta = SENSOR_META[sensorName];
    if (!meta) throw new Error(`unknown sensor ${sensorName}`);
    const value = readFromSource(sensorName, source, meta);
    const history = this.history.get(sensorName) || [];
    const normalized = clamp(Number(value || 0), 0, 1e9);
    const anomaly = anomalyScore(normalized, history, meta.direction);
    const reading = {
      sensor: sensorName,
      category: meta.category,
      unit: meta.unit,
      value: normalized,
      anomalyScore: anomaly,
      status: anomaly > 2 ? "anomalous" : "normal",
      timestamp: new Date().toISOString(),
    };
    history.push(normalized);
    this.history.set(sensorName, history.slice(-120));
    this.emit("reading", reading);
    return response("sensor-reading", reading);
  }

  sample(source = this.source) {
    return {
      timestamp: new Date().toISOString(),
      readings: SENSOR_CATALOG.map((name) => this.read(name, source).data),
      summary: this.summary(),
    };
  }

  summary() {
    const all = [...this.history.values()].flat();
    return {
      sensors: SENSOR_CATALOG.length,
      mean: mean(all),
      categories: [...new Set(SENSOR_CATALOG.map((s) => SENSOR_META[s].category))],
    };
  }
}

function readFromSource(name, source, meta) {
  if (source && typeof source.read === "function") {
    const value = source.read(name, meta);
    if (value !== undefined) return value;
  }
  if (source && Object.prototype.hasOwnProperty.call(source, name)) return source[name];
  if (source && source.metrics && Object.prototype.hasOwnProperty.call(source.metrics, name)) return source.metrics[name];
  const seed = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return ((seed % 100) / 100) + (meta.direction === "up" ? 0.1 : 0.3);
}

function anomalyScore(value, history, direction) {
  if (!history.length) return 0;
  const score = Math.abs(zScore(value, history));
  const trend = direction === "down" ? -1 : 1;
  return score + trend * 0;
}

function metaCategory(name) {
  if (name.startsWith("cpu") || name.startsWith("numa") || name.startsWith("cache") || name.startsWith("run") || name.startsWith("interrupt")) return "compute";
  if (name.startsWith("io") || name.startsWith("disk") || name.startsWith("raid") || name.startsWith("nvme") || name.startsWith("block") || name.startsWith("snapshot")) return "storage";
  if (name.startsWith("gc") || name.startsWith("db") || name.startsWith("queue") || name.startsWith("api") || name.startsWith("error") || name.startsWith("retry") || name.startsWith("circuit") || name.startsWith("feature") || name.startsWith("ab")) return "application";
  if (name.startsWith("revenue") || name.startsWith("cart") || name.startsWith("session") || name.startsWith("api_monetization") || name.startsWith("sla") || name.startsWith("churn") || name.startsWith("support") || name.startsWith("nps") || name.startsWith("payment") || name.startsWith("conversion")) return "business";
  return "network";
}

module.exports = {
  SENSOR_CATALOG,
  SensorHub,
};

