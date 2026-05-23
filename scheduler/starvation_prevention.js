/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */

const { createSubsystem, now } = require('../core/lib/cyxv');

class StarvationPrevention {
  constructor() {
    this.waiting = new Map();
  }

  enqueue(tenant, request) {
    const queue = this.waiting.get(tenant) || [];
    queue.push({ request, at: now() });
    this.waiting.set(tenant, queue);
  }

  pick() {
    let oldestTenant = null;
    let oldestAt = Infinity;
    for (const [tenant, queue] of this.waiting.entries()) {
      if (!queue.length) continue;
      const at = new Date(queue[0].at).getTime();
      if (at < oldestAt) {
        oldestAt = at;
        oldestTenant = tenant;
      }
    }
    if (!oldestTenant) return null;
    return { tenant: oldestTenant, item: this.waiting.get(oldestTenant).shift() };
  }
}

module.exports = Object.assign(createSubsystem('scheduler/starvation_prevention', {
  category: 'scheduler',
  description: 'starvation prevention'
}), {
  create: () => new StarvationPrevention(),
  StarvationPrevention
});
