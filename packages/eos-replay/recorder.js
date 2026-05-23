"use strict";

const crypto = require("node:crypto");
const os = require("node:os");

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function tsToSeconds(value = Date.now()) {
  return Math.floor(Number(value) > 10_000_000_000 ? Number(value) / 1000 : Number(value));
}

function eventId(seed) {
  return "evt_" + crypto.createHash("sha256").update(JSON.stringify(seed)).digest("hex").slice(0, 16);
}

class ReplayRecorder {
  constructor(options = {}) {
    this.runId = options.runId || `run_${crypto.randomUUID().slice(0, 8)}`;
    this.actor = options.actor || "system";
    this.host = options.host || os.hostname();
    this.transport = typeof options.transport === "function" ? options.transport : null;
    this.events = [];
    this.sequence = 0;
  }

  emit(type, payload = {}) {
    const event = {
      id: payload.id || eventId({
        runId: this.runId,
        type,
        sequence: this.sequence,
        actor: payload.actor || this.actor,
        key: payload.key ?? null,
        value: payload.value ?? null,
        caused_by: Array.isArray(payload.caused_by) ? payload.caused_by : [],
      }),
      ts: tsToSeconds(payload.ts),
      run_id: this.runId,
      type,
      actor: payload.actor || this.actor,
      key: payload.key ?? null,
      value: payload.value ?? null,
      caused_by: Array.isArray(payload.caused_by) ? [...payload.caused_by] : [],
      meta: {
        host: payload.meta?.host || this.host,
        latency_ms: payload.meta?.latency_ms ?? null,
        ...canonicalize(payload.meta || {}),
      },
      sequence: this.sequence,
    };

    event.meta.event_hash = hash(event);
    this.sequence += 1;
    this.events.push(event);

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

  fork(meta = {}) {
    return this.emit("STATE", { key: "fork", value: meta, meta });
  }

  snapshot() {
    return {
      run_id: this.runId,
      actor: this.actor,
      host: this.host,
      events: [...this.events],
      hash: hash(this.events),
    };
  }
}

function createRecorder(options = {}) {
  return new ReplayRecorder(options);
}

module.exports = {
  ReplayRecorder,
  createRecorder,
};
