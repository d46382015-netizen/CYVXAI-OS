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

class JsonFileStore {
  constructor(filePath, seed = {}) {
    this.filePath = filePath;
    this.seed = clone(seed);
    this.data = null;
  }

  load() {
    if (this.data) return this.data;
    if (!this.filePath) {
      this.data = clone(this.seed);
      return this.data;
    }
    if (!fs.existsSync(this.filePath)) {
      this.data = clone(this.seed);
      this.save(this.data);
      return this.data;
    }
    const raw = fs.readFileSync(this.filePath, "utf8");
    this.data = raw.trim() ? JSON.parse(raw) : clone(this.seed);
    return this.data;
  }

  save(data = this.data) {
    if (!this.filePath) {
      this.data = clone(data);
      return this.data;
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.data = clone(data);
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2) + "\n");
    return this.data;
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
    const next = mutator(clone(this.load()));
    return this.save(next);
  }

  append(key, value) {
    const source = this.load();
    const list = Array.isArray(getPath(source, key, [])) ? getPath(source, key, []) : [];
    list.push(value);
    setPath(source, key, list);
    this.save(source);
    return value;
  }
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
  return current;
}

function setPath(object, key, value) {
  const parts = String(key).split(".");
  let current = object;
  while (parts.length > 1) {
    const part = parts.shift();
    if (current[part] == null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[0]] = value;
  return object;
}

module.exports = { JsonFileStore };
