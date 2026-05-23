/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */

const { EventEmitter } = require('events');
const { createSubsystem, now } = require('../core/lib/cyxv');

class OtelPipeline extends EventEmitter {
  constructor() {
    super();
    this.spans = [];
    this.metrics = [];
    this.logs = [];
  }

  ingest(record) {
    const entry = { at: now(), ...record };
    if (record.kind === 'span') this.spans.push(entry);
    else if (record.kind === 'metric') this.metrics.push(entry);
    else this.logs.push(entry);
    this.emit('ingest', entry);
    return entry;
  }
}

module.exports = Object.assign(createSubsystem('observability/otel_pipeline', {
  category: 'observability',
  description: 'telemetry pipeline'
}), {
  create: () => new OtelPipeline(),
  OtelPipeline
});
