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

function latencyAtmosphere(samples = []) {
  const mean = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
  return { mean, storm: mean > 100, samples: samples.length };
}

module.exports = Object.assign(createSubsystem('internet/latency_atmosphere', {
  category: 'internet',
  description: 'latency atmosphere model'
}), {
  latencyAtmosphere
});
