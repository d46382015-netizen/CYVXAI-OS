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
const { response } = require("../shared/attribution");

class BlockchainChain {
  constructor() {
    this.blocks = [];
    this.pending = [];
    this.addBlock({ type: "genesis", payload: {} });
  }

  addTransaction(tx) {
    this.pending.push(tx);
    return response("tx", { tx });
  }

  addBlock(data) {
    const previousHash = this.blocks[this.blocks.length - 1]?.hash || "0";
    const block = {
      index: this.blocks.length,
      timestamp: new Date().toISOString(),
      previousHash,
      data,
      hash: hash(previousHash + JSON.stringify(data) + this.blocks.length),
    };
    this.blocks.push(block);
    return response("block", { block });
  }
}

function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }

module.exports = { BlockchainChain };

