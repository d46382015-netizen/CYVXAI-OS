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

class QuotaManager {
  constructor() {
    this.quotas = new Map();
    this.usage = new Map();
  }

  set(tenant, limits = {}) {
    this.quotas.set(tenant, { cpu: Infinity, memory: Infinity, requests: Infinity, ...limits });
  }

  consume(tenant, usage = {}) {
    const current = this.usage.get(tenant) || { cpu: 0, memory: 0, requests: 0 };
    const next = { ...current, ...Object.fromEntries(Object.entries(usage).map(([k, v]) => [k, (current[k] || 0) + v])) };
    this.usage.set(tenant, next);
    return this.check(tenant);
  }

  check(tenant) {
    const quota = this.quotas.get(tenant) || {};
    const usage = this.usage.get(tenant) || {};
    for (const key of Object.keys(quota)) {
      if ((usage[key] || 0) > quota[key]) return { allowed: false, reason: `${key}_quota_exceeded` };
    }
    return { allowed: true, reason: 'within_quota' };
  }
}

module.exports = Object.assign(createSubsystem('scheduler/quota_manager', {
  category: 'scheduler',
  description: 'quota manager'
}), {
  create: () => new QuotaManager(),
  QuotaManager
});
