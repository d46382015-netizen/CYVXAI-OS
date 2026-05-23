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

const crypto = require("node:crypto");

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { DatabaseSync } = require("node:sqlite");

class CyvxDatabase {
  constructor(file = path.join(os.homedir(), ".cyvx", "cyvx.db")) {
    this.file = file;
    this.db = null;
  }

  open() {
    if (this.db) return this.db;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.db = new DatabaseSync(this.file);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metrics (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, payload TEXT NOT NULL, meta TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, payload TEXT NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS genome_pool (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS raft_log (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
    return this.db;
  }

  get(key, fallback = null) {
    const row = this.open().prepare("SELECT value FROM kv WHERE key = ?").get(key);
    return row ? JSON.parse(row.value) : fallback;
  }

  set(key, value) {
    this.open().prepare("INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
    return value;
  }

  appendEvent(type, payload) {
    this.open().prepare("INSERT INTO events(type, payload, created_at) VALUES(?, ?, ?)").run(type, JSON.stringify(payload), new Date().toISOString());
  }

  recordMetric(name, payload) {
    this.open().prepare("INSERT INTO metrics(name, payload, created_at) VALUES(?, ?, ?)").run(name, JSON.stringify(payload), new Date().toISOString());
  }

  saveRaftState(state) {
    return this.set("raft_state", state);
  }

  loadRaftState() {
    return this.get("raft_state", null);
  }

  saveRaftLog(log) {
    const record = {
      log,
      savedAt: new Date().toISOString(),
    };
    this.set("raft_log", record);
    this.open().prepare("INSERT INTO raft_log(payload, created_at) VALUES(?, ?)").run(JSON.stringify(record), record.savedAt);
    return record;
  }

  loadRaftLog() {
    const record = this.get("raft_log", null);
    return record ? record.log || [] : [];
  }

  saveRaftSnapshot(snapshot) {
    return this.set("raft_snapshot", snapshot);
  }

  loadRaftSnapshot() {
    return this.get("raft_snapshot", null);
  }

  appendAudit(type, payload, meta = {}) {
    this.open().prepare("INSERT INTO audit_log(type, payload, meta, created_at) VALUES(?, ?, ?, ?)").run(type, JSON.stringify(payload), JSON.stringify(meta), new Date().toISOString());
  }

  saveSnapshot(name, payload) {
    const serialized = JSON.stringify(payload);
    const hash = crypto.createHash("sha256").update(serialized).digest("hex");
    this.open().prepare("INSERT INTO snapshots(name, payload, hash, created_at) VALUES(?, ?, ?, ?)").run(name, serialized, hash, new Date().toISOString());
    return { name, hash, payload };
  }

  loadSnapshots(name = null, limit = 20) {
    const rows = name
      ? this.open().prepare("SELECT name, payload, hash, created_at FROM snapshots WHERE name = ? ORDER BY id DESC LIMIT ?").all(name, limit)
      : this.open().prepare("SELECT name, payload, hash, created_at FROM snapshots ORDER BY id DESC LIMIT ?").all(limit);
    return rows.map((row) => ({
      name: row.name,
      payload: JSON.parse(row.payload),
      hash: row.hash,
      created_at: row.created_at,
    }));
  }

  loadAudit(limit = 200) {
    return this.open().prepare("SELECT type, payload, meta, created_at FROM audit_log ORDER BY id DESC LIMIT ?").all(limit).map((row) => ({
      type: row.type,
      payload: JSON.parse(row.payload),
      meta: JSON.parse(row.meta),
      created_at: row.created_at,
    }));
  }

  saveGenomePool(genomePool) {
    this.open().prepare("INSERT INTO genome_pool(payload, created_at) VALUES(?, ?)").run(JSON.stringify(genomePool), new Date().toISOString());
    this.set("genome_pool_latest", genomePool);
  }

  loadGenomePool() {
    const row = this.open().prepare("SELECT payload FROM genome_pool ORDER BY id DESC LIMIT 1").get();
    return row ? JSON.parse(row.payload) : null;
  }

  upsertAgents(agents) {
    const stmt = this.open().prepare("INSERT INTO agents(id, payload, updated_at) VALUES(?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at");
    const now = new Date().toISOString();
    const db = this.open();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const agent of agents) stmt.run(agent.id, JSON.stringify(agent), now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  loadAgents() {
    const rows = this.open().prepare("SELECT payload FROM agents ORDER BY id").all();
    return rows.map((row) => JSON.parse(row.payload));
  }

  history(name = null, limit = 100) {
    if (name) {
      return this.open().prepare("SELECT payload, created_at FROM metrics WHERE name = ? ORDER BY id DESC LIMIT ?").all(name, limit).map((row) => ({ ...JSON.parse(row.payload), created_at: row.created_at }));
    }
    return this.open().prepare("SELECT type, payload, created_at FROM events ORDER BY id DESC LIMIT ?").all(limit).map((row) => ({ type: row.type, ...JSON.parse(row.payload), created_at: row.created_at }));
  }
}

module.exports = { CyvxDatabase };
