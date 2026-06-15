"use strict";

const fs = require("node:fs");
const path = require("node:path");

class GitHubWebhookStore {
  constructor(options = {}) {
    this.filePath = options.filePath || null;
    this.maxDeliveries = Math.max(100, Number(options.maxDeliveries || 5_000));
    this.memory = normalizeState(options.seed || {});
  }

  load() {
    if (!this.filePath) return clone(this.memory);
    if (!fs.existsSync(this.filePath)) {
      this.save(normalizeState({}));
      return clone(this.memory);
    }
    const raw = fs.readFileSync(this.filePath, "utf8");
    this.memory = normalizeState(raw.trim() ? JSON.parse(raw) : {});
    return clone(this.memory);
  }

  save(state) {
    const normalized = normalizeState(state);
    normalized.updated_at = new Date().toISOString();
    this.memory = normalized;
    if (!this.filePath) return clone(this.memory);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(tempPath, this.filePath);
    return clone(this.memory);
  }

  update(mutator) {
    const state = this.load();
    const next = mutator(state) || state;
    prune(next, this.maxDeliveries);
    return this.save(next);
  }

  accept(input = {}) {
    const deliveryId = requireString(input.delivery_id, "delivery_id");
    let result;
    this.update((state) => {
      const existing = state.deliveries[deliveryId];
      if (existing) {
        existing.duplicate_count = Number(existing.duplicate_count || 0) + 1;
        existing.last_duplicate_at = new Date().toISOString();
        result = { duplicate: true, delivery: clone(existing) };
        return state;
      }
      const now = new Date().toISOString();
      const delivery = {
        delivery_id: deliveryId,
        event: String(input.event || "unknown"),
        action: input.action || null,
        installation_id: input.installation_id || null,
        repository_id: input.repository_id || null,
        repository: input.repository || null,
        sender: input.sender || null,
        payload_sha256: input.payload_sha256 || null,
        payload: clone(input.payload || {}),
        status: "accepted",
        attempts: 0,
        duplicate_count: 0,
        mapping: null,
        error: null,
        accepted_at: now,
        updated_at: now,
      };
      state.deliveries[deliveryId] = delivery;
      state.order.unshift(deliveryId);
      state.metrics.accepted += 1;
      result = { duplicate: false, delivery: clone(delivery) };
      return state;
    });
    return result;
  }

  markProcessing(deliveryId) {
    return this.transition(deliveryId, "processing", (record) => {
      record.attempts = Number(record.attempts || 0) + 1;
      record.processing_started_at = new Date().toISOString();
      record.error = null;
    });
  }

  complete(deliveryId, mapping) {
    return this.transition(deliveryId, "completed", (record, state) => {
      record.mapping = clone(mapping || {});
      record.completed_at = new Date().toISOString();
      state.metrics.completed += 1;
      state.metrics.last_completed_at = record.completed_at;
    });
  }

  fail(deliveryId, error) {
    return this.transition(deliveryId, "failed", (record, state) => {
      record.error = sanitizeError(error);
      record.failed_at = new Date().toISOString();
      state.metrics.failed += 1;
      state.metrics.last_failed_at = record.failed_at;
    });
  }

  transition(deliveryId, status, apply) {
    let output = null;
    this.update((state) => {
      const record = state.deliveries[deliveryId];
      if (!record) throw new Error(`unknown GitHub delivery: ${deliveryId}`);
      record.status = status;
      record.updated_at = new Date().toISOString();
      if (typeof apply === "function") apply(record, state);
      output = clone(record);
      return state;
    });
    return output;
  }

  get(deliveryId) {
    return clone(this.load().deliveries[deliveryId] || null);
  }

  list(options = {}) {
    const state = this.load();
    const limit = Math.max(1, Math.min(200, Number(options.limit || 50)));
    return state.order.slice(0, limit).map((id) => clone(state.deliveries[id])).filter(Boolean);
  }

  health() {
    const state = this.load();
    const records = Object.values(state.deliveries);
    const pending = records.filter((item) => item.status === "accepted" || item.status === "processing").length;
    const failed = records.filter((item) => item.status === "failed").length;
    return {
      durable: Boolean(this.filePath),
      file_path_configured: Boolean(this.filePath),
      deliveries: records.length,
      pending,
      failed,
      accepted_total: state.metrics.accepted,
      completed_total: state.metrics.completed,
      failed_total: state.metrics.failed,
      last_completed_at: state.metrics.last_completed_at,
      last_failed_at: state.metrics.last_failed_at,
      updated_at: state.updated_at,
    };
  }
}

function normalizeState(input) {
  const state = input && typeof input === "object" ? clone(input) : {};
  state.version = 1;
  state.deliveries = state.deliveries && typeof state.deliveries === "object" ? state.deliveries : {};
  state.order = Array.isArray(state.order) ? state.order.filter((id) => state.deliveries[id]) : Object.keys(state.deliveries);
  state.metrics = Object.assign({
    accepted: 0,
    completed: 0,
    failed: 0,
    last_completed_at: null,
    last_failed_at: null,
  }, state.metrics || {});
  state.updated_at = state.updated_at || new Date().toISOString();
  return state;
}

function prune(state, maxDeliveries) {
  while (state.order.length > maxDeliveries) {
    const id = state.order.pop();
    delete state.deliveries[id];
  }
}

function requireString(value, name) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}

function sanitizeError(error) {
  return {
    name: error && error.name ? String(error.name) : "Error",
    code: error && error.code ? String(error.code) : null,
    message: error && error.message ? String(error.message).slice(0, 1_000) : String(error).slice(0, 1_000),
  };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

module.exports = { GitHubWebhookStore };
