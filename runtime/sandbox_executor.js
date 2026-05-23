/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */

const vm = require('vm');
const { createSubsystem, now } = require('../core/lib/cyxv');

class SandboxExecutor {
  constructor() {
    this.runs = [];
  }

  run(source, context = {}) {
    const sandbox = vm.createContext(Object.freeze({ ...context, Math, Date }));
    const result = vm.runInContext(source, sandbox, { timeout: 1000 });
    const record = { at: now(), sourceHash: require('../core/lib/cyxv').hash(source), result };
    this.runs.push(record);
    return record;
  }
}

module.exports = Object.assign(createSubsystem('runtime/sandbox_executor', {
  category: 'runtime',
  description: 'sandbox executor'
}), {
  create: () => new SandboxExecutor(),
  SandboxExecutor
});
