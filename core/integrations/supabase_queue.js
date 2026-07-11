"use strict";

const crypto = require("node:crypto");
const { truthy } = require("../security/production_guard");

class SupabaseQueueClient {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.data = options.dataClient;
    this.queueName = String(options.queueName || this.env.CYVX_QUEUE_NAME || "cyvx_jobs");
    this.visibilitySeconds = positive(options.visibilitySeconds || this.env.CYVX_QUEUE_VISIBILITY_SECONDS, 60);
    this.batchSize = positive(options.batchSize || this.env.CYVX_QUEUE_BATCH_SIZE, 10);
    this.required = options.required ?? truthy(this.env.CYVX_REQUIRE_QUEUE);
    this.metrics = { sent: 0, claimed: 0, acknowledged: 0, failed: 0, last_error: null, last_activity_at: null };
  }

  configured() { return Boolean(this.data && this.data.configured()); }

  async send(type, payload = {}, options = {}) {
    assertType(type);
    const envelope = {
      id: options.id || crypto.randomUUID(),
      type,
      tenant_id: options.tenantId || null,
      trace_id: options.traceId || null,
      created_at: new Date().toISOString(),
      payload: object(payload),
      metadata: object(options.metadata),
    };
    try {
      const result = await this.data.rpc("cyvx_enqueue_job", {
        p_queue_name: this.queueName,
        p_message: envelope,
        p_delay_seconds: Math.max(0, Math.floor(Number(options.delaySeconds || 0))),
      });
      this.metrics.sent += 1;
      this.#activity();
      return { ok: true, queue: this.queueName, message: envelope, result };
    } catch (error) {
      this.#failure(error);
      throw error;
    }
  }

  async claim(options = {}) {
    try {
      const result = await this.data.rpc("cyvx_claim_jobs", {
        p_queue_name: this.queueName,
        p_visibility_seconds: positive(options.visibilitySeconds, this.visibilitySeconds),
        p_limit: positive(options.limit, this.batchSize),
      });
      const jobs = normalizeJobs(result);
      this.metrics.claimed += jobs.length;
      this.#activity();
      return jobs;
    } catch (error) {
      this.#failure(error);
      throw error;
    }
  }

  async acknowledge(jobId) {
    const result = await this.data.rpc("cyvx_ack_job", { p_queue_name: this.queueName, p_job_id: Number(jobId) });
    this.metrics.acknowledged += 1;
    this.#activity();
    return result;
  }

  async fail(job, error, options = {}) {
    const message = normalizeJob(job).message;
    const result = await this.data.rpc("cyvx_fail_job", {
      p_queue_name: this.queueName,
      p_job_id: Number(job.job_id || job.msg_id),
      p_message: message,
      p_error: { code: error.code || "JOB_FAILED", message: String(error.message || error), stack: safeStack(error) },
      p_terminal: Boolean(options.terminal),
    });
    this.metrics.failed += 1;
    this.#failure(error);
    return result;
  }

  snapshot() {
    return {
      configured: this.configured(),
      required: this.required,
      queue_name: this.queueName,
      visibility_seconds: this.visibilitySeconds,
      batch_size: this.batchSize,
      metrics: { ...this.metrics },
    };
  }

  #activity() { this.metrics.last_activity_at = new Date().toISOString(); this.metrics.last_error = null; }
  #failure(error) { this.metrics.last_error = String(error && error.message || error); this.metrics.last_activity_at = new Date().toISOString(); }
}

class QueueWorker {
  constructor(options = {}) {
    if (!options.queue) throw new Error("A queue client is required.");
    this.queue = options.queue;
    this.telemetry = options.telemetry || null;
    this.enabled = options.enabled ?? truthy(process.env.CYVX_QUEUE_WORKER);
    this.intervalMs = positive(options.intervalMs || process.env.CYVX_QUEUE_POLL_MS, 3000);
    this.maxAttempts = positive(options.maxAttempts || process.env.CYVX_QUEUE_MAX_ATTEMPTS, 5);
    this.handlers = new Map();
    this.timer = null;
    this.running = false;
    this.metrics = { ticks: 0, processed: 0, succeeded: 0, retried: 0, dead_lettered: 0, unknown: 0, last_error: null, last_completed_at: null };
  }

  register(type, handler) {
    assertType(type);
    if (typeof handler !== "function") throw new TypeError("Queue handler must be a function.");
    this.handlers.set(type, handler);
    return this;
  }

  start() {
    if (!this.enabled || this.timer || !this.queue.configured()) return this.snapshot();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
    queueMicrotask(() => void this.tick());
    return this.snapshot();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    return this.snapshot();
  }

  async tick() {
    if (!this.enabled || this.running || !this.queue.configured()) return this.snapshot();
    this.running = true;
    this.metrics.ticks += 1;
    try {
      const jobs = await this.queue.claim();
      for (const rawJob of jobs) await this.#process(rawJob);
      this.metrics.last_error = null;
    } catch (error) {
      this.metrics.last_error = error.message;
      this.#capture(error, { operation: "queue.tick" });
    } finally {
      this.running = false;
      this.metrics.last_completed_at = new Date().toISOString();
    }
    return this.snapshot();
  }

  snapshot() {
    return {
      enabled: this.enabled,
      configured: this.queue.configured(),
      running: this.running,
      scheduled: Boolean(this.timer),
      interval_ms: this.intervalMs,
      max_attempts: this.maxAttempts,
      handlers: [...this.handlers.keys()].sort(),
      metrics: { ...this.metrics },
    };
  }

  async #process(rawJob) {
    const job = normalizeJob(rawJob);
    const type = String(job.message && job.message.type || "");
    const handler = this.handlers.get(type);
    this.metrics.processed += 1;
    if (!handler) {
      this.metrics.unknown += 1;
      const error = coded("QUEUE_HANDLER_NOT_FOUND", `No handler is registered for ${type || "unknown"}.`);
      await this.queue.fail(job, error, { terminal: true });
      this.metrics.dead_lettered += 1;
      return;
    }
    const span = this.telemetry && this.telemetry.startSpan("queue.job", { job_id: job.job_id, job_type: type, tenant_id: job.message.tenant_id || "" });
    try {
      await handler(job.message.payload || {}, { job, envelope: job.message });
      await this.queue.acknowledge(job.job_id);
      this.metrics.succeeded += 1;
      if (span) span.end("ok");
    } catch (error) {
      const terminal = Number(job.read_count || 1) >= this.maxAttempts;
      await this.queue.fail(job, error, { terminal });
      if (terminal) this.metrics.dead_lettered += 1;
      else this.metrics.retried += 1;
      this.#capture(error, { operation: "queue.job", job_id: job.job_id, job_type: type, terminal });
      if (span) span.end("error", { error: error.code || error.message, terminal });
    }
  }

  #capture(error, context) {
    if (this.telemetry && typeof this.telemetry.captureError === "function") this.telemetry.captureError(error, context);
  }
}

function normalizeJobs(result) {
  const rows = Array.isArray(result) ? result : result && Array.isArray(result.jobs) ? result.jobs : [];
  return rows.map(normalizeJob).filter((job) => Number.isFinite(job.job_id));
}

function normalizeJob(value) {
  const raw = value && typeof value === "object" ? value : {};
  let message = raw.message;
  if (typeof message === "string") {
    try { message = JSON.parse(message); } catch { message = { type: "invalid", payload: { raw: message } }; }
  }
  return {
    ...raw,
    job_id: Number(raw.job_id ?? raw.msg_id),
    read_count: Number(raw.read_count ?? raw.read_ct ?? 1),
    message: object(message),
  };
}

function assertType(type) {
  if (!/^[a-z][a-z0-9._-]{1,127}$/.test(String(type || ""))) throw coded("QUEUE_TYPE_INVALID", "Queue job type must be a stable lowercase identifier.");
}

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function positive(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback; }
function coded(code, message) { const error = new Error(message); error.code = code; return error; }
function safeStack(error) { return error && error.stack ? String(error.stack).split("\n").slice(0, 12).join("\n") : null; }

module.exports = { QueueWorker, SupabaseQueueClient, normalizeJob, normalizeJobs };
