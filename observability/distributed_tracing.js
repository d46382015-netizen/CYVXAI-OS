/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */

const { createSubsystem, now, hash } = require('../core/lib/cyxv');

class DistributedTracing {
  constructor() {
    this.traces = new Map();
  }

  start(name, meta = {}) {
    const id = hash({ name, meta, at: now() });
    this.traces.set(id, { id, name, meta, spans: [], started_at: now() });
    return id;
  }

  span(traceId, name, meta = {}) {
    const trace = this.traces.get(traceId);
    if (!trace) return null;
    const span = { id: hash({ traceId, name, meta, at: now() }), name, meta, at: now() };
    trace.spans.push(span);
    return span;
  }
}

module.exports = Object.assign(createSubsystem('observability/distributed_tracing', {
  category: 'observability',
  description: 'distributed tracing'
}), {
  create: () => new DistributedTracing(),
  DistributedTracing
});
