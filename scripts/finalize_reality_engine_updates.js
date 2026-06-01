"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function write(rel, content) {
  fs.writeFileSync(path.join(ROOT, rel), content);
}

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error("Missing snippet for " + label);
  return source.replace(needle, replacement);
}

function updateBuild() {
  const rel = "scripts/build.js";
  let source = read(rel);
  source = replaceOnce(
    source,
    '  "core/platform/decision_intelligence_v1.js",\n',
    '  "core/platform/decision_intelligence_v1.js",\n  "core/platform/reality_engine_v1.js",\n',
    rel + " check files"
  );
  source = replaceOnce(
    source,
    '      "/ask",\n      "/metrics",\n',
    '      "/ask",\n      "/metrics",\n      "/api/v1/reality-engine",\n',
    rel + " endpoints"
  );
  write(rel, source);
}

function appendTest() {
  const rel = "test/platform.test.js";
  let source = read(rel);
  if (source.includes("reality engine compresses the thesis into evidence")) return;
  source += `

test('reality engine compresses the thesis into evidence', async () => {
  const kernel = createTempKernel();
  kernel.launchMission({
    title: 'Reduce evidence gap',
    objective: 'capture verified outcome data',
    target_entity_ids: ['company'],
    autonomy_level: 3,
  });
  const report = kernel.realityEngine();

  assert.ok(report.one_sentence_compression.includes('prediction-to-outcome'));
  assert.ok(report.fact_map.loop_count >= 1);
  assert.ok(report.highest_leverage_decision);
  assert.ok(report.fastest_path_to_proof);

  const controller = {
    status: () => ({ powered_by: 'CYVX' }),
    overview: () => ({ health: { label: 'healthy' } }),
    insights: () => [],
    agentsSnapshot: () => [],
    leaderboard: () => [],
    roadmap: () => [],
    snapshot: () => ({ cluster: { workloads: [] } }),
    history: () => [],
    statusModel: { snapshot: () => ({ data: {} }) },
    ask: () => ({}),
    submitWorkload: () => ({}),
    executeAction: () => ({}),
    registerSocket: () => {},
    actions: [],
  };
  const { server } = createApiServer(controller, { platform: kernel });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const response = await fetch('http://127.0.0.1:' + address.port + '/api/v1/reality-engine');
  const body = await response.json();
  await new Promise((resolve) => server.close(resolve));

  assert.equal(response.status, 200);
  assert.ok(body.one_sentence_compression);
  assert.ok(body.fact_map);
});
`;
  write(rel, source);
}

try {
  updateBuild();
  appendTest();
  console.log("Reality engine build metadata updated.");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
