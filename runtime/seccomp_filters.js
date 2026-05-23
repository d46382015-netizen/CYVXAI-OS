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

class SeccompFilters {
  constructor(allowlist = []) {
    this.allowlist = new Set(allowlist);
    this.blocklist = new Set();
  }

  allow(syscall) {
    this.allowlist.add(syscall);
  }

  block(syscall) {
    this.blocklist.add(syscall);
  }

  check(syscall) {
    if (this.blocklist.has(syscall)) return { allowed: false, reason: 'blocked' };
    if (this.allowlist.size && !this.allowlist.has(syscall)) return { allowed: false, reason: 'not_allowed' };
    return { allowed: true, reason: 'allowed' };
  }
}

module.exports = Object.assign(createSubsystem('runtime/seccomp_filters', {
  category: 'runtime',
  description: 'seccomp filter model'
}), {
  create: (allowlist) => new SeccompFilters(allowlist),
  SeccompFilters
});
