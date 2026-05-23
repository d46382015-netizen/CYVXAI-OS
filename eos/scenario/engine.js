import crypto from "node:crypto";

function hashSeed(seed) {
  return crypto.createHash("sha256").update(String(seed)).digest("hex");
}

export class ScenarioEngine {
  constructor(config = {}) {
    this.config = config;
  }

  generate() {
    const seed = this.config.seed || "eos";
    const digest = hashSeed(seed);
    const nodes = Number(this.config.nodes || 3);
    const workload = this.config.workload || "write_heavy";

    return {
      seed,
      digest,
      nodes,
      topology: this.config.topology || "mesh",
      workload,
      faults: this.config.faults || {},
      events: []
    };
  }
}
