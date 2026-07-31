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

const fs = require("node:fs");
const path = require("node:path");
const { SqliteStateStore } = require("./sqlite_store");

class JsonFileStore {
  constructor(filePath, seed = {}) {
    if (isSqlitePath(filePath)) {
      const legacyFilePath = process.env.CYVX_PLATFORM_LEGACY_STATE
        || process.env.CYVX_PLATFORM_STATE
        || path.join(path.dirname(filePath), "platform-state.json");
      return new SqliteStateStore(filePath, seed, { legacyFilePath });
    }
    this.filePath = filePath;
    this.seed = clone(seed);
    this.data = null;
  }

  load() {
    if (this.data) return clone(this.data);
    if (!this.filePath) {
      this.data = clone(this.seed);
      return clone(this.data);
    }
    if (!fs.existsSync(this.filePath)) {
      this.data = clone(this.seed);
      this.save(this.data);
      return clone(this.data);
    }
    const raw = fs.readFileSync(this.filePath, "utf8");
    this.data = raw.trim() ? JSON.parse(raw) : clone(this.seed);
    return clone(this.data);
  }

  save(data = this.data) {
    if (!this.filePath) {
      this.data = clone(data);
      return clone(this.data);
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.data = clone(data == null ? this.seed : data);
    const temp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const backup = `${this.filePath}.bak`;
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2) + "\n", { mode: 0o600 });
    if (fs.existsSync(this.filePath)) fs.copyFileSync(this.filePath, backup);
    fs.renameSync(temp, this.filePath);
    return clone(this.data);
  }

  get(key, fallback = null) {
    const source = this.load();
    if (!key) return clone(source);
    return getPath(source, key, fallback);
  }

  set(key, value) {
    const source = this.load();
    setPath(source, key, value);
    return this.save(source);
  }

  update(mutator) {
    const source = clone(this.load());
    const next = mutator(source);
    return this.save(next === undefined ? source : next);
  }

  append(key, value) {
    const source = this.load();
    const current = getPath(source, key, []);
    const list = Array.isArray(current) ? current : [];
    list.push(clone(value));
    setPath(source, key, list);
    this.save(source);
    return value;
  }

  metadata() {
    return {
      backend: "json",
      file: this.filePath || null,
      backup: this.filePath ? `${this.filePath}.bak` : null,
      bytes: this.filePath && fs.existsSync(this.filePath) ? fs.statSync(this.filePath).size : 0,
      transaction_locking: false,
    };
  }
}

function isSqlitePath(filePath) {
  if (!filePath) return false;
  const backend = String(process.env.CYVX_PLATFORM_BACKEND || "").trim().toLowerCase();
  if (backend === "json") return false;
  if (backend === "sqlite") return true;
  return [".db", ".sqlite", ".sqlite3"].includes(path.extname(filePath).toLowerCase());
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

module.exports = { JsonFileStore, isSqlitePath };
