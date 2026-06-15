"use strict";

const fs = require("node:fs");
const path = require("node:path");

class GitHubAuthStore {
  constructor(options = {}) {
    this.filePath = options.filePath || null;
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
    if (!this.filePath) return clone(normalized);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(normalized, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(temp, this.filePath);
    return clone(normalized);
  }

  update(mutator) {
    const current = this.load();
    const next = mutator(current) || current;
    return this.save(next);
  }

  putState(stateId, record) {
    this.update((state) => {
      state.oauth_states[stateId] = Object.assign({}, clone(record), { id: stateId });
      return state;
    });
    return this.getState(stateId);
  }

  getState(stateId) {
    return clone(this.load().oauth_states[stateId] || null);
  }

  consumeState(stateId, consumedAt = new Date().toISOString()) {
    let output = null;
    this.update((state) => {
      const record = state.oauth_states[stateId];
      if (!record) return state;
      if (record.consumed_at) {
        output = clone(record);
        return state;
      }
      record.consumed_at = consumedAt;
      record.updated_at = consumedAt;
      output = clone(record);
      return state;
    });
    return output;
  }

  saveConnection(userId, connection) {
    const key = String(userId || "").trim();
    if (!key) throw new Error("userId is required");
    let saved;
    this.update((state) => {
      const existing = state.connections[key] || {};
      saved = Object.assign({}, existing, clone(connection), {
        user_id: key,
        created_at: existing.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      state.connections[key] = saved;
      return state;
    });
    return clone(saved);
  }

  getConnection(userId) {
    return clone(this.load().connections[String(userId || "").trim()] || null);
  }

  listConnections() {
    return Object.values(this.load().connections).map(clone);
  }

  deleteConnection(userId) {
    const key = String(userId || "").trim();
    let deleted = null;
    this.update((state) => {
      deleted = state.connections[key] ? clone(state.connections[key]) : null;
      delete state.connections[key];
      return state;
    });
    return deleted;
  }

  pruneExpired(nowMs = Date.now()) {
    this.update((state) => {
      for (const [id, record] of Object.entries(state.oauth_states)) {
        if (Date.parse(record.expires_at || 0) < nowMs && record.consumed_at) delete state.oauth_states[id];
      }
      return state;
    });
  }

  health() {
    const state = this.load();
    const states = Object.values(state.oauth_states);
    return {
      durable: Boolean(this.filePath),
      oauth_states: states.length,
      active_oauth_states: states.filter((item) => !item.consumed_at && Date.parse(item.expires_at || 0) > Date.now()).length,
      connections: Object.keys(state.connections).length,
      updated_at: state.updated_at,
    };
  }
}

function normalizeState(input) {
  const state = input && typeof input === "object" ? clone(input) : {};
  state.version = 1;
  state.oauth_states = state.oauth_states && typeof state.oauth_states === "object" ? state.oauth_states : {};
  state.connections = state.connections && typeof state.connections === "object" ? state.connections : {};
  state.updated_at = state.updated_at || new Date().toISOString();
  return state;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

module.exports = { GitHubAuthStore };
