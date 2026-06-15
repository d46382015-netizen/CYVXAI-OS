"use strict";

class RequestCounters {
  constructor(options = {}) {
    this.now = options.now || Date.now;
    this.startedAt = this.now();
    this.total = 0;
    this.inflight = 0;
    this.failures = 0;
    this.durationTotal = 0;
    this.durations = [];
  }

  begin() {
    this.total += 1;
    this.inflight += 1;
    const started = this.now();
    let done = false;
    return (statusCode = 200) => {
      if (done) return;
      done = true;
      this.inflight = Math.max(0, this.inflight - 1);
      const duration = Math.max(0, this.now() - started);
      this.durationTotal += duration;
      this.durations.push(duration);
      if (this.durations.length > 256) this.durations.shift();
      if (Number(statusCode) >= 500) this.failures += 1;
    };
  }

  snapshot() {
    const values = [...this.durations].sort((a, b) => a - b);
    return {
      started_at: new Date(this.startedAt).toISOString(),
      uptime_seconds: Math.max(0, Math.floor((this.now() - this.startedAt) / 1000)),
      requests_total: this.total,
      inflight_requests: this.inflight,
      errors_total: this.failures,
      error_rate: this.total ? Number((this.failures / this.total).toFixed(6)) : 0,
      latency_ms: {
        average: this.total ? Number((this.durationTotal / this.total).toFixed(2)) : 0,
        p50: pick(values, 0.5),
        p95: pick(values, 0.95),
        max: values.length ? values[values.length - 1] : 0,
      },
    };
  }
}

function pick(values, ratio) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];
}

module.exports = { RequestCounters, pick };
