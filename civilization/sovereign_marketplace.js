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

function sovereignMarketplace(listings = []) {
  return listings.slice().sort((a, b) => (a.cost || 0) - (b.cost || 0));
}

module.exports = Object.assign(createSubsystem('civilization/sovereign_marketplace', {
  category: 'civilization',
  description: 'sovereign marketplace'
}), {
  sovereignMarketplace
});
