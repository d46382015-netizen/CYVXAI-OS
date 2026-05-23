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

class ModelValidator {
  constructor(model = {}) {
    this.model = model;
  }

  validate() {
    const required = ['state', 'transitions'];
    const missing = required.filter((key) => this.model[key] == null);
    return { ok: missing.length === 0, missing };
  }
}

module.exports = Object.assign(createSubsystem('formal/model_validator', {
  category: 'formal',
  description: 'model validator'
}), {
  create: (model) => new ModelValidator(model),
  ModelValidator
});
