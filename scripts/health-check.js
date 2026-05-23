/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
"use strict";

const BASE_URL = process.env.CYVX_URL || `http://127.0.0.1:${process.env.CYVX_PORT || 3000}`;

async function main() {
  const checks = [
    ["/status", "status"],
    ["/v1/agents", "agents"],
    ["/v1/leaderboard", "leaderboard"],
    ["/v1/roadmap", "roadmap"],
    ["/api/v1/overview", "overview"],
    ["/api/v1/insights", "insights"],
    ["/api/v1/status-model", "status-model"],
  ];
  const results = [];
  for (const [path, name] of checks) {
    const res = await fetch(`${BASE_URL}${path}`);
    const body = await res.json();
    results.push({ name, ok: res.ok, keys: Object.keys(body || {}).slice(0, 8) });
  }
  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    ok: results.every((item) => item.ok),
    results,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

