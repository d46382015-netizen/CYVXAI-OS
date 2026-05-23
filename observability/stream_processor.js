/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */

const { createSubsystem } = require('../core/lib/cyxv');

class StreamProcessor {
  constructor() {
    this.window = [];
  }

  push(event) {
    this.window.push({ at: Date.now(), event });
    if (this.window.length > 5000) this.window.shift();
    return event;
  }

  aggregate(selector = (x) => x) {
    return this.window.map((entry) => selector(entry.event));
  }
}

module.exports = Object.assign(createSubsystem('observability/stream_processor', {
  category: 'observability',
  description: 'stream processor'
}), {
  create: () => new StreamProcessor(),
  StreamProcessor
});
