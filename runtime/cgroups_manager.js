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

class CgroupsManager {
  constructor() {
    this.groups = new Map();
  }

  create(id, limits = {}) {
    const group = { id, limits: { cpu: null, memory: null, pids: null, ...limits }, created_at: now(), usage: {} };
    this.groups.set(id, group);
    return group;
  }

  updateUsage(id, usage = {}) {
    const group = this.groups.get(id);
    if (!group) return null;
    group.usage = { ...group.usage, ...usage, updated_at: now() };
    return group;
  }

  check(id, usage = {}) {
    const group = this.groups.get(id);
    if (!group) return { allowed: true, reason: 'untracked' };
    const cpu = group.limits.cpu;
    const memory = group.limits.memory;
    const pids = group.limits.pids;
    if (cpu != null && usage.cpu != null && usage.cpu > cpu) return { allowed: false, reason: 'cpu_limit' };
    if (memory != null && usage.memory != null && usage.memory > memory) return { allowed: false, reason: 'memory_limit' };
    if (pids != null && usage.pids != null && usage.pids > pids) return { allowed: false, reason: 'pid_limit' };
    return { allowed: true, reason: 'within_limits' };
  }
}

module.exports = Object.assign(createSubsystem('runtime/cgroups_manager', {
  category: 'runtime',
  description: 'cgroups manager'
}), {
  create: () => new CgroupsManager(),
  CgroupsManager
});
