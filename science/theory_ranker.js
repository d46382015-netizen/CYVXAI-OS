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

function rankTheories(theories = []) {
  return theories.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
}

module.exports = Object.assign(createSubsystem('science/theory_ranker', {
  category: 'science',
  description: 'theory ranker'
}), {
  rankTheories
});
