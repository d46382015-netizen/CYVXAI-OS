"use strict";

class AutonomySupervisor {
  constructor(options = {}) {
    if (!options.runtime) throw new Error("Spark runtime is required");
    this.runtime = options.runtime;
    this.flagProvider = options.flagProvider || null;
    this.environment = options.environment || process.env.CYVX_ENV || process.env.NODE_ENV || "development";
    this.enabled = options.enabled ?? String(process.env.CYVX_AUTONOMY || "1") !== "0";
    this.intervalMs = positiveInteger(options.intervalMs || process.env.CYVX_AUTONOMY_INTERVAL_MS, 3000);
    this.maxPerTick = positiveInteger(options.maxPerTick || process.env.CYVX_AUTONOMY_MAX_PER_TICK, 10);
    this.logger = options.logger || ((entry) => console.log(JSON.stringify(entry)));
    this.timer = null;
    this.running = false;
    this.metrics = {
      ticks: 0,
      executions: 0,
      skipped: 0,
      flag_blocks: 0,
      failures: 0,
      last_started_at: null,
      last_completed_at: null,
      last_error: null,
    };
  }

  start() {
    if (!this.enabled || this.timer) return this.snapshot();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
    queueMicrotask(() => this.tick());
    return this.snapshot();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    return this.snapshot();
  }

  effectiveEnabled() {
    if (!this.enabled) return false;
    if (!this.flagProvider || typeof this.flagProvider.getBooleanValue !== "function") return true;
    return this.flagProvider.getBooleanValue("autonomy.enabled", true, { environment: this.environment });
  }

  async tick() {
    if (!this.enabled || this.running) return this.snapshot();
    if (!this.effectiveEnabled()) {
      this.metrics.ticks += 1;
      this.metrics.skipped += 1;
      this.metrics.flag_blocks += 1;
      this.metrics.last_started_at = new Date().toISOString();
      this.metrics.last_completed_at = this.metrics.last_started_at;
      this.log("autonomy.execution.blocked", { reason: "feature_flag", flag: "autonomy.enabled" });
      return this.snapshot();
    }
    this.running = true;
    this.metrics.ticks += 1;
    this.metrics.last_started_at = new Date().toISOString();
    this.metrics.last_error = null;

    try {
      const sparks = this.runtime.listSparks()
        .filter((spark) => spark.status === "active")
        .slice(0, this.maxPerTick);

      for (const spark of sparks) {
        if (!this.effectiveEnabled()) {
          this.metrics.skipped += 1;
          this.metrics.flag_blocks += 1;
          this.log("autonomy.execution.blocked", { spark_id: spark.id, reason: "feature_flag", flag: "autonomy.enabled" });
          break;
        }
        try {
          const graph = this.runtime.graph(spark.id);
          const approved = graph.approvals.some((approval) => approval.status === "approved");
          if (!approved || graph.mission?.status !== "active") {
            this.metrics.skipped += 1;
            continue;
          }
          this.runtime.execute(spark.id, { owner_id: spark.owner_id, max_steps: 20 });
          this.metrics.executions += 1;
          this.log("autonomy.execution.completed", { spark_id: spark.id, mission_id: spark.active_mission_id });
        } catch (error) {
          this.metrics.failures += 1;
          this.metrics.last_error = error.message;
          this.log("autonomy.execution.failed", { spark_id: spark.id, error: error.message });
        }
      }
    } finally {
      this.running = false;
      this.metrics.last_completed_at = new Date().toISOString();
    }

    return this.snapshot();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      effective_enabled: this.effectiveEnabled(),
      running: this.running,
      scheduled: Boolean(this.timer),
      interval_ms: this.intervalMs,
      max_per_tick: this.maxPerTick,
      metrics: { ...this.metrics },
    };
  }

  log(event, fields = {}) {
    this.logger({ timestamp: new Date().toISOString(), event, ...fields });
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

module.exports = { AutonomySupervisor, positiveInteger };
