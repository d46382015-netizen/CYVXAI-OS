"use strict";

class FixedWindowRateLimiter {
  constructor(options = {}) {
    this.limit = positiveInteger(options.limit, 600);
    this.windowMs = positiveInteger(options.windowMs, 60_000);
    this.maxEntries = positiveInteger(options.maxEntries, 10_000);
    this.now = options.now || Date.now;
    this.buckets = new Map();
  }

  take(key, cost = 1) {
    const now = this.now();
    const normalizedKey = String(key || "anonymous").slice(0, 256);
    let bucket = this.buckets.get(normalizedKey);
    if (!bucket || now >= bucket.resetAt) bucket = { count: 0, resetAt: now + this.windowMs };
    bucket.count += Math.max(1, Number(cost) || 1);
    this.buckets.set(normalizedKey, bucket);
    if (this.buckets.size > this.maxEntries) this.prune(now);
    return {
      allowed: bucket.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
    };
  }

  prune(now = this.now()) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    while (this.buckets.size > this.maxEntries) this.buckets.delete(this.buckets.keys().next().value);
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

module.exports = { FixedWindowRateLimiter, positiveInteger };
