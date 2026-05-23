/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */

const crypto = require('crypto');

function now() {
  return new Date().toISOString();
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clamp(num, min = 0, max = 1) {
  return Math.max(min, Math.min(max, num));
}

function average(values) {
  const xs = values.filter((n) => Number.isFinite(n));
  if (!xs.length) return 0;
  return xs.reduce((sum, n) => sum + n, 0) / xs.length;
}

function trend(values) {
  if (!values || values.length < 2) return 0;
  return values[values.length - 1] - values[0];
}

function entropy(values) {
  const total = values.reduce((sum, n) => sum + Math.max(0, n), 0);
  if (!total) return 0;
  return -values.reduce((sum, n) => {
    const p = Math.max(0, n) / total;
    return p > 0 ? sum + p * Math.log2(p) : sum;
  }, 0);
}

function envelope(name, data = {}) {
  return {
    powered_by: 'CYVX',
    creator: 'Dakota Lee Jonsgaard',
    version: '6.0.0',
    timestamp: now(),
    name,
    ...data
  };
}

function createModule(name, capabilities = {}) {
  const state = {
    name,
    started_at: null,
    status: 'idle',
    metrics: {},
    observations: [],
    decisions: [],
    ...capabilities.initialState
  };

  const module = {
    name,
    description: capabilities.description || name,
    state,
    start(context = {}) {
      state.started_at = state.started_at || now();
      state.status = 'online';
      if (typeof capabilities.onStart === 'function') {
        capabilities.onStart(state, context);
      }
      return this.status();
    },
    stop() {
      state.status = 'stopped';
      if (typeof capabilities.onStop === 'function') {
        capabilities.onStop(state);
      }
      return this.status();
    },
    tick(input = {}, context = {}) {
      const result = typeof capabilities.tick === 'function'
        ? capabilities.tick(state, input, context)
        : { score: clamp(0.5 + (state.observations.length % 10) / 20), note: 'stable' };
      state.last_tick = { at: now(), input, result };
      state.observations.push(state.last_tick);
      if (state.observations.length > 500) state.observations.shift();
      return result;
    },
    analyze(input = {}, context = {}) {
      const result = typeof capabilities.analyze === 'function'
        ? capabilities.analyze(state, input, context)
        : this.tick(input, context);
      state.last_analysis = { at: now(), input, result };
      return result;
    },
    decide(input = {}, context = {}) {
      const result = typeof capabilities.decide === 'function'
        ? capabilities.decide(state, input, context)
        : { action: 'observe', confidence: 0.6 };
      state.decisions.push({ at: now(), input, result });
      if (state.decisions.length > 500) state.decisions.shift();
      return result;
    },
    status() {
      return envelope(name, {
        status: state.status,
        started_at: state.started_at,
        metrics: state.metrics,
        observations: state.observations.length,
        decisions: state.decisions.length
      });
    }
  };

  return module;
}

function createSubsystem(name, capabilities = {}) {
  return createModule(name, capabilities);
}

module.exports = {
  now,
  hash,
  clamp,
  average,
  trend,
  entropy,
  envelope,
  createModule,
  createSubsystem
};
