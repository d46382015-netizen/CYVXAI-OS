"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

class SqliteStateStore {
  constructor(filePath, seed = {}, options = {}) {
    if (!filePath) throw new Error("SqliteStateStore requires a file path");
    this.filePath = filePath;
    this.seed = clone(seed);
    this.legacyFilePath = options.legacyFilePath || null;
    this.busyTimeoutMs = Math.max(100, Number(options.busyTimeoutMs || 5_000));
    this.db = null;
    this.data = null;
    this.inTransaction = false;
  }

  open() {
    if (this.db) return this.db;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=${this.busyTimeoutMs};
      CREATE TABLE IF NOT EXISTS platform_state (
        key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS platform_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        source TEXT,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    this.ensureSeeded();
    return this.db;
  }

  ensureSeeded() {
    const existing = this.db.prepare("SELECT key FROM platform_state WHERE key = 'root'").get();
    if (existing) return;

    let initial = clone(this.seed);
    let migration = null;
    if (this.legacyFilePath && fs.existsSync(this.legacyFilePath)) {
      const raw = fs.readFileSync(this.legacyFilePath, "utf8");
      if (raw.trim()) {
        initial = JSON.parse(raw);
        migration = {
          name: "legacy-json-import",
          source: this.legacyFilePath,
          details: { source_preserved: true },
        };
      }
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const now = new Date().toISOString();
      this.db.prepare("INSERT INTO platform_state(key, payload, revision, updated_at) VALUES('root', ?, 1, ?)")
        .run(JSON.stringify(initial), now);
      if (migration) this.recordMigration(migration, now);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  load() {
    const row = this.open().prepare("SELECT payload FROM platform_state WHERE key = 'root'").get();
    this.data = row ? JSON.parse(row.payload) : clone(this.seed);
    return clone(this.data);
  }

  save(data = this.data) {
    const write = () => this.writeWithinTransaction(data);
    if (this.inTransaction) return write();
    return this.runTransaction(write);
  }

  writeWithinTransaction(data) {
    const next = clone(data == null ? this.seed : data);
    const now = new Date().toISOString();
    this.open().prepare(`
      INSERT INTO platform_state(key, payload, revision, updated_at)
      VALUES('root', ?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        payload = excluded.payload,
        revision = platform_state.revision + 1,
        updated_at = excluded.updated_at
    `).run(JSON.stringify(next), now);
    this.data = next;
    return clone(next);
  }

  runTransaction(operation) {
    if (this.inTransaction) return operation();
    const db = this.open();
    db.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  get(key, fallback = null) {
    const source = this.load();
    if (!key) return clone(source);
    return getPath(source, key, fallback);
  }

  set(key, value) {
    return this.runTransaction(() => {
      const source = this.load();
      setPath(source, key, value);
      return this.save(source);
    });
  }

  update(mutator) {
    return this.runTransaction(() => {
      const source = clone(this.load());
      const next = mutator(source);
      return this.save(next === undefined ? source : next);
    });
  }

  append(key, value) {
    this.runTransaction(() => {
      const source = this.load();
      const current = getPath(source, key, []);
      const list = Array.isArray(current) ? current : [];
      list.push(clone(value));
      setPath(source, key, list);
      this.save(source);
    });
    return value;
  }

  importJson(jsonPath, options = {}) {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("platform state JSON must contain an object");
    }
    const metadata = this.metadata();
    if (!options.replace && metadata.revision > 1) {
      const error = new Error("destination contains state; pass replace=true to overwrite it");
      error.code = "PLATFORM_STATE_EXISTS";
      throw error;
    }
    this.runTransaction(() => {
      this.save(parsed);
      this.recordMigration({
        name: "manual-json-import",
        source: jsonPath,
        details: { source_preserved: true, replace: Boolean(options.replace) },
      });
    });
    return this.metadata();
  }

  exportJson(jsonPath) {
    const snapshot = this.load();
    atomicWriteJson(jsonPath, snapshot);
    return { path: jsonPath, bytes: fs.statSync(jsonPath).size, revision: this.metadata().revision };
  }

  recordMigration(input, now = new Date().toISOString()) {
    this.open().prepare("INSERT INTO platform_migrations(name, source, details, created_at) VALUES(?, ?, ?, ?)")
      .run(input.name, input.source || null, JSON.stringify(input.details || {}), now);
  }

  metadata() {
    const db = this.open();
    const row = db.prepare("SELECT revision, updated_at, length(payload) AS payload_bytes FROM platform_state WHERE key = 'root'").get();
    const journal = db.prepare("PRAGMA journal_mode").get();
    const migration = db.prepare("SELECT name, source, details, created_at FROM platform_migrations ORDER BY id DESC LIMIT 1").get();
    return {
      backend: "sqlite",
      file: this.filePath,
      journal_mode: journal && (journal.journal_mode || Object.values(journal)[0]) || "unknown",
      revision: Number(row && row.revision || 0),
      updated_at: row && row.updated_at || null,
      payload_bytes: Number(row && row.payload_bytes || 0),
      last_migration: migration ? {
        name: migration.name,
        source: migration.source,
        details: JSON.parse(migration.details || "{}"),
        created_at: migration.created_at,
      } : null,
    };
  }

  close() {
    if (!this.db) return;
    this.db.close();
    this.db = null;
  }
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const backup = `${filePath}.bak`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backup);
  fs.renameSync(temp, filePath);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function getPath(object, key, fallback) {
  if (!key) return object;
  const parts = String(key).split(".");
  let current = object;
  for (const part of parts) {
    if (current == null || typeof current !== "object" || !(part in current)) return fallback;
    current = current[part];
  }
  return clone(current);
}

function setPath(object, key, value) {
  const parts = String(key).split(".");
  let current = object;
  while (parts.length > 1) {
    const part = parts.shift();
    if (current[part] == null || typeof current[part] !== "object") current[part] = {};
    current = current[part];
  }
  current[parts[0]] = clone(value);
  return object;
}

module.exports = { SqliteStateStore, atomicWriteJson };
