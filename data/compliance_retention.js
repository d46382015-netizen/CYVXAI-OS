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

class ComplianceRetention {
  constructor(days = 30) {
    this.days = days;
  }

  keep(record) {
    return !record.deleted && (!record.expires_at || new Date(record.expires_at).getTime() > Date.now());
  }
}

module.exports = Object.assign(createSubsystem('data/compliance_retention', {
  category: 'data',
  description: 'compliance retention'
}), {
  create: (days) => new ComplianceRetention(days),
  ComplianceRetention
});
