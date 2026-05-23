/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
export function select(population, scoreFn = (item) => item.score || 0) {
  return [...population].sort((a, b) => scoreFn(b) - scoreFn(a));
}

