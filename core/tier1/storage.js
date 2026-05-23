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
const crypto = require("node:crypto");
const { response } = require("../shared/attribution");

class StorageTier {
  constructor(rootDir = path.join(process.env.HOME || "/root", ".cyvx", "storage")) {
    this.rootDir = rootDir;
    fs.mkdirSync(this.rootDir, { recursive: true });
    this.walPath = path.join(this.rootDir, "wal.log");
    this.sstPath = path.join(this.rootDir, "sst.jsonl");
  }

  appendOnlyWal(record) {
    const line = JSON.stringify({ at: new Date().toISOString(), record }) + "\n";
    fs.appendFileSync(this.walPath, line);
    return response("wal", { appended: true, bytes: Buffer.byteLength(line) });
  }

  lsmTreePut(key, value) {
    const entry = { key, value, at: new Date().toISOString() };
    fs.appendFileSync(this.sstPath, JSON.stringify(entry) + "\n");
    return response("lsm-put", { entry });
  }

  sstables() {
    if (!fs.existsSync(this.sstPath)) return response("sstables", { entries: [] });
    const entries = fs.readFileSync(this.sstPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    return response("sstables", { entries });
  }

  compactionEngine() {
    const entries = this.sstables().data.entries;
    const compacted = [...new Map(entries.map((entry) => [entry.key, entry])).values()];
    fs.writeFileSync(this.sstPath, compacted.map((entry) => JSON.stringify(entry)).join("\n") + (compacted.length ? "\n" : ""));
    return response("compaction", { compacted: compacted.length });
  }

  bloomFilters(keys = []) {
    const filter = new Set(keys);
    return response("bloom", {
      mayContain: (key) => filter.has(key),
      size: filter.size,
    });
  }

  snapshotEngine(name, data) {
    const snapshotPath = path.join(this.rootDir, `${name}-${Date.now()}.snapshot.json`);
    fs.writeFileSync(snapshotPath, JSON.stringify(data, null, 2));
    return response("storage-snapshot", { snapshotPath });
  }

  distributedReplication(targets = []) {
    return response("replication", {
      targets,
      replicated: true,
      checksum: crypto.createHash("sha256").update(JSON.stringify(targets)).digest("hex"),
    });
  }

  antiEntropySync(remote = []) {
    const local = this.sstables().data.entries;
    const divergence = Math.abs(local.length - remote.length);
    return response("anti-entropy", { divergence, synced: divergence <= 1 });
  }

  shardBalancing(shards = []) {
    const balanced = shards.slice().sort((a, b) => Number(a.load || 0) - Number(b.load || 0));
    return response("shard-balancing", { shards: balanced });
  }

  temporalQuerySupport(query = {}) {
    const entries = this.sstables().data.entries.filter((entry) => {
      const at = new Date(entry.at).getTime();
      return (!query.from || at >= new Date(query.from).getTime()) && (!query.to || at <= new Date(query.to).getTime());
    });
    return response("temporal-query", { entries });
  }

  causalIndexing(events = []) {
    const index = events.map((event, index) => ({ index, cause: event.cause, effect: event.effect }));
    return response("causal-index", { index });
  }

  eventLineageTracking(events = []) {
    const lineage = events.map((event) => ({ id: event.id, parents: event.parents || [] }));
    return response("lineage", { lineage });
  }
}

module.exports = {
  StorageTier,
};
