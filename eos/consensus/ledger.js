import crypto from "node:crypto";

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class GlobalEventView {
  constructor() {
    this.byNode = new Map();
  }

  ingest(nodeId, events = []) {
    const current = this.byNode.get(nodeId) || [];
    const known = new Set(current.map((event) => event.id));
    const merged = current.concat(events.filter((event) => !known.has(event.id)));
    this.byNode.set(nodeId, merged);
    return merged;
  }

  nodes() {
    return [...this.byNode.keys()];
  }

  eventLog() {
    return [...this.byNode.values()].flat();
  }

  reconstructed() {
    return this.eventLog().slice().sort((a, b) => {
      const ta = Number(a.timestamp ?? 0);
      const tb = Number(b.timestamp ?? 0);
      if (ta !== tb) return ta - tb;

      const da = Number(a.vector_clock?.depth ?? a.causal_parents?.length ?? 0);
      const db = Number(b.vector_clock?.depth ?? b.causal_parents?.length ?? 0);
      if (da !== db) return da - db;

      return String(a.id).localeCompare(String(b.id));
    });
  }

  hash() {
    return stableHash(this.reconstructed());
  }
}
