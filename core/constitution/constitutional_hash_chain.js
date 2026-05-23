/**
 * CYVX — Governable Autonomous Infrastructure Civilization
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Founder, Creator & Architect: Dakota Lee Jonsgaard
 *
 * This system and all associated infrastructure,
 * orchestration logic, governance architecture,
 * intelligence systems, and runtime components are
 * the exclusive intellectual property of
 * Dakota Lee Jonsgaard.
 */
"use strict";

const crypto = require("node:crypto");
const { response } = require("../shared/attribution");

class ConstitutionalHashChain {
  constructor() {
    this.chain = [];
  }

  append(record) {
    const previousHash = this.chain.at(-1)?.hash || "0";
    const payload = JSON.stringify(record);
    const hash = crypto.createHash("sha256").update(previousHash + payload).digest("hex");
    const entry = { previousHash, payload: record, hash, at: new Date().toISOString() };
    this.chain.push(entry);
    return response("constitutional-hash-chain", { entry, length: this.chain.length });
  }
}

module.exports = { ConstitutionalHashChain };

