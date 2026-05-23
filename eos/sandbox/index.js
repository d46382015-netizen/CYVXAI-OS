export class Sandbox {
  constructor({
    memoryLimitBytes = 64 * 1024 * 1024,
    executionCapMs = 1000,
    eventRateLimit = 1000
  } = {}) {
    this.memoryLimitBytes = memoryLimitBytes;
    this.executionCapMs = executionCapMs;
    this.eventRateLimit = eventRateLimit;
  }

  assertEventBudget(count) {
    if (count > this.eventRateLimit) {
      throw new Error("event rate limit exceeded");
    }
  }

  run(fn) {
    const startedAt = Date.now();
    const result = fn();
    const duration = Date.now() - startedAt;
    if (duration > this.executionCapMs) {
      throw new Error("execution cap exceeded");
    }
    return result;
  }
}
