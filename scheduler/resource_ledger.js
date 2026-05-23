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

class ResourceLedger {
  constructor() {
    this.entries = [];
  }

  record(tenant, resource, amount) {
    const entry = { tenant, resource, amount, at: now() };
    this.entries.push(entry);
    return entry;
  }

  balance(tenant) {
    return this.entries.filter((x) => x.tenant === tenant).reduce((sum, x) => sum + x.amount, 0);
  }
}

module.exports = Object.assign(createSubsystem('scheduler/resource_ledger', {
  category: 'scheduler',
  description: 'resource accounting ledger'
}), {
  create: () => new ResourceLedger(),
  ResourceLedger
});
