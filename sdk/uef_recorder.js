"use strict";

const crypto = require("node:crypto");
const { hash, now } = require("../core/lib/cyxv");

function toTs(value = Date.now()) {
  if (Number.isFinite(value) && value > 10_000_000_000) {
    return Math.floor(value / 1000);
  }
  if (Number.isFinite(value)) {
    return Math.floor(value);
  }
  return Math.floor(Date.now() / 1000);
}

function createEventId(seed) {
  return "evt_" + crypto.createHash("sha256").update(JSON.stringify(seed)).digest("hex").slice(0, 16);
}

class UefRecorder {
  constructor(options = {}) {
    this.runId = options.runId || `run_${crypto.randomUUID().slice(0, 8)}`;
    this.actor = options.actor || "system";
    this.host = options.host || require("node:os").hostname();
    this.stream = [];
    this.sequence = 0;
    this.transport = typeof options.transport === "function" ? options.transport : null;
  }

  emit(type, payload = {}) {
    const event = {
      id: payload.id || createEventId({
        runId: this.runId,
        type,
        sequence: this.sequence,
        actor: this.actor,
        key: payload.key ?? null,
        value: payload.value ?? null,
        caused_by: payload.caused_by || [],
      }),
      ts: toTs(payload.ts),
      run_id: this.runId,
      type,
      actor: payload.actor || this.actor,
      key: payload.key ?? null,
      value: payload.value ?? null,
      caused_by: Array.isArray(payload.caused_by) ? [...payload.caused_by] : [],
      meta: {
        host: payload.meta?.host || this.host,
        latency_ms: payload.meta?.latency_ms ?? null,
        ...payload.meta,
      },
      sequence: this.sequence,
    };

    event.meta.event_hash = hash(event);
    this.sequence += 1;
    this.stream.push(event);

    if (this.transport) {
      this.transport(event);
    }

    return event;
  }

  set(key, value, meta = {}) {
    return this.emit("SET", { key, value, meta });
  }

  call(value, meta = {}) {
    return this.emit("CALL", { value, meta });
  }

  ret(value, meta = {}) {
    return this.emit("RETURN", { value, meta });
  }

  error(value, meta = {}) {
    return this.emit("ERROR", { value, meta });
  }

  state(key, value, meta = {}) {
    return this.emit("STATE", { key, value, meta });
  }

  link(eventId, meta = {}) {
    return this.emit("CALL", { caused_by: [eventId], meta });
  }

  export() {
    return [...this.stream];
  }

  snapshot() {
    return {
      run_id: this.runId,
      actor: this.actor,
      host: this.host,
      events: this.export(),
      hash: hash(this.stream),
      recorded_at: now(),
    };
  }
}

function createRecorder(options = {}) {
  return new UefRecorder(options);
}

module.exports = {
  UefRecorder,
  createRecorder,
};
