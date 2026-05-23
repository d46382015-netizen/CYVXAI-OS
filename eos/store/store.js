import fs from "node:fs";
import path from "node:path";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, "utf8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line));
}

export class EventStore {
  constructor({ dataDir = ".eos-data", runId = "default" } = {}) {
    this.dataDir = dataDir;
    this.runId = runId;
    this.rootDir = path.resolve(dataDir, "runs", runId);
    this.walFile = path.join(this.rootDir, "events.wal");
    this.snapshotDir = path.join(this.rootDir, "snapshots");
    this.events = [];
    ensureDir(this.rootDir);
    ensureDir(this.snapshotDir);
    this.events = readJsonLines(this.walFile);
  }

  append(event) {
    this.events.push(event);
    fs.appendFileSync(this.walFile, `${JSON.stringify(event)}\n`);
    return event;
  }

  queryByProcess(id) {
    return this.events.filter((event) => event.process_id === id);
  }

  queryByTime(range = {}) {
    const from = range.from ?? Number.NEGATIVE_INFINITY;
    const to = range.to ?? Number.POSITIVE_INFINITY;
    return this.events.filter((event) => {
      const ts = Number(event.timestamp ?? 0);
      return ts >= from && ts <= to;
    });
  }

  saveSnapshot(id, snapshot) {
    const file = path.join(this.snapshotDir, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
    return file;
  }

  loadSnapshot(id) {
    const file = path.join(this.snapshotDir, `${id}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
}
