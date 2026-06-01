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
  if (!source.includes(needle)) {
    throw new Error("Missing snippet for " + label);
  }
  return source.replace(needle, replacement);
}

function insertBefore(source, needle, insert, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error("Missing anchor for " + label);
  return source.slice(0, index) + insert + source.slice(index);
}

function insertAfter(source, needle, insert, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error("Missing anchor for " + label);
  return source.slice(0, index + needle.length) + insert + source.slice(index + needle.length);
}

function updatePlatformIndex() {
  const rel = "core/platform/index.js";
  let source = read(rel);
  source = replaceOnce(
    source,
    'const { augmentDecisionIntelligence } = require("./decision_intelligence_v1");\n',
    'const { augmentDecisionIntelligence } = require("./decision_intelligence_v1");\nconst { augmentRealityEngine } = require("./reality_engine_v1");\n',
    rel + " import"
  );
  source = replaceOnce(
    source,
    "augmentDecisionIntelligence(PlatformKernel, models);\n",
    "augmentDecisionIntelligence(PlatformKernel, models);\naugmentRealityEngine(PlatformKernel, models);\n",
    rel + " augment"
  );
  write(rel, source);
}

function updateApi() {
  const rel = "api/index.js";
  let source = read(rel);
  source = insertBefore(
    source,
    '      if (url.pathname === "/api/v1/proof-ledger") {',
    '      if (url.pathname === "/api/v1/reality-engine") {\n        return json(res, 200, wrap(platform.realityEngine ? platform.realityEngine() : {}));\n      }\n',
    rel + " reality route"
  );
  write(rel, source);
}

function updateCli() {
  const rel = "cli/cyvx.js";
  let source = read(rel);
  source = replaceOnce(
    source,
    '"reality", "portfolio", "decisions"',
    '"reality", "reality-engine", "portfolio", "decisions"',
    rel + " command list"
  );
  source = insertAfter(
    source,
    '    case "reality":\n      print({ reality: kernel.reality(), observations: kernel.observations() });\n      return;\n',
    '    case "reality-engine": {\n      const query = parseQuery(args);\n      if (process.env.CYVX_PORT || query.port) {\n        try {\n          const base = "http://127.0.0.1:" + (query.port || process.env.CYVX_PORT);\n          const output = await call("GET", base + "/api/v1/reality-engine");\n          print(output);\n          return;\n        } catch (error) {}\n      }\n      print(kernel.realityEngine(query));\n      return;\n    }\n',
    rel + " reality engine case"
  );
  source = replaceOnce(
    source,
    '    case "proof": return null;\n',
    '    case "reality-engine": return { method: "GET", path: base + "/api/v1/reality-engine" };\n    case "proof": return null;\n',
    rel + " routeFor"
  );
  write(rel, source);
}

function updateUiHtml() {
  const rel = "ui/index.html";
  let source = read(rel);
  source = replaceOnce(
    source,
    '          <button class="nav-pill" data-target="proofPanel">Repository Proof</button>\n',
    '          <button class="nav-pill" data-target="proofPanel">Repository Proof</button>\n          <button class="nav-pill" data-target="realityEnginePanel">Reality Engine</button>\n',
    rel + " nav"
  );
  source = replaceOnce(
    source,
    '            Model a company, visualize the reality graph, launch agents, run missions, simulate outcomes,\n            and publish executive intelligence from one living platform.\n',
    '            Model a company, visualize the reality graph, launch agents, run missions, simulate outcomes,\n            verify outcomes, and compress the platform toward evidence instead of architecture.\n',
    rel + " lede"
  );
  source = insertAfter(
    source,
    '        <article class="panel panel-span-4" id="proofPanel">\n          <div class="panel-head">\n            <div>\n              <h2>Repository Proof</h2>\n              <p>Git state, latest proof report, reality gap, and CIR-linked evidence.</p>\n            </div>\n          </div>\n          <div class="summary-note">This surface ties platform output back to the actual repository and the latest learning record.</div>\n          <pre class="code-box" id="repositoryHealthOutput"></pre>\n          <pre class="code-box" id="proofOutput"></pre>\n        </article>\n',
    '\n        <article class="panel panel-span-12" id="realityEnginePanel">\n          <div class="panel-head">\n            <div>\n              <h2>Reality Engine vΩ</h2>\n              <p>Evidence-first compression of predictions, outcomes, error, learning, and calibration.</p>\n            </div>\n          </div>\n          <div class="summary-note">This view is falsifiable: if loop count rises while error does not fall, the thesis weakens.</div>\n          <pre class="code-box" id="realityEngineOutput"></pre>\n        </article>\n',
    rel + " panel"
  );
  write(rel, source);
}

function updateUiApp() {
  const rel = "ui/app.js";
  let source = read(rel);
  source = replaceOnce(source, '  thesis: null,\n};', '  thesis: null,\n  realityEngine: null,\n};', rel + " state");
  source = replaceOnce(source, '  proofOutput: id("proofOutput"),\n', '  proofOutput: id("proofOutput"),\n  realityEngineOutput: id("realityEngineOutput"),\n', rel + " dom");
  source = replaceOnce(
    source,
    '      requestJson("/api/v1/repository-health"),\n      requestJson("/api/v1/proof"),\n',
    '      requestJson("/api/v1/repository-health"),\n      requestJson("/api/v1/proof"),\n      requestJson("/api/v1/reality-engine"),\n',
    rel + " sync fetch"
  );
  source = replaceOnce(
    source,
    '    state.repositoryHealth = results[19] || (results[20] && results[20].repositoryHealth) || null;\n    state.proof = results[20] ? (results[20].proof || results[20]) : null;\n    state.thesis = results[3] ? (results[3].thesis || results[3].thesis_dashboard || null) : null;\n',
    '    state.repositoryHealth = results[19] || (results[20] && results[20].repositoryHealth) || null;\n    state.proof = results[20] ? (results[20].proof || results[20]) : null;\n    state.realityEngine = results[21] || null;\n    state.thesis = results[3] ? (results[3].thesis || results[3].thesis_dashboard || null) : null;\n',
    rel + " sync assign"
  );
  source = replaceOnce(
    source,
    '  renderIntelligence(filteredPatterns, filteredRecommendations, filteredPriorities, intelligence);\n  renderDecisions(filteredDecisions, filteredMissions, filteredOutcomes);\n',
    '  renderIntelligence(filteredPatterns, filteredRecommendations, filteredPriorities, intelligence);\n  renderRealityEngine(state.realityEngine);\n  renderDecisions(filteredDecisions, filteredMissions, filteredOutcomes);\n',
    rel + " renderAll"
  );
  source = replaceOnce(
    source,
    "  dom.summaryNote.textContent = 'Platform posture: ' + (health.label || 'unknown') + '. ' + (state.executive && state.executive.answers ? state.executive.answers.whatShouldWeDo : '') + ' ' + ((state.reality && state.reality.reality) ? ('Drift ' + formatPercent(state.reality.reality.reality_drift || 0)) : '') + (state.proof ? (' Proof ' + formatPercent(state.proof.proof_score || 0) + ' | Repo ' + ((state.repositoryHealth && state.repositoryHealth.clean) ? 'clean' : 'dirty')) : '');\n",
    "  dom.summaryNote.textContent = 'Platform posture: ' + (health.label || 'unknown') + '. ' + (state.executive && state.executive.answers ? state.executive.answers.whatShouldWeDo : '') + ' ' + ((state.reality && state.reality.reality) ? ('Drift ' + formatPercent(state.reality.reality.reality_drift || 0)) : '') + (state.proof ? (' Proof ' + formatPercent(state.proof.proof_score || 0) + ' | Repo ' + ((state.repositoryHealth && state.repositoryHealth.clean) ? 'clean' : 'dirty')) : '') + (state.realityEngine ? (' | ' + state.realityEngine.one_sentence_compression) : '');\n",
    rel + " summary note"
  );
  source = insertBefore(
    source,
    'function renderEvents(events) {',
    'function renderRealityEngine(realityEngine) {\n  if (dom.realityEngineOutput) {\n    dom.realityEngineOutput.textContent = safeJson(realityEngine || {});\n  }\n}\n\n',
    rel + " renderRealityEngine"
  );
  write(rel, source);
}

function updateReadme() {
  const rel = "README.md";
  let source = read(rel);
  source = insertAfter(
    source,
    '## Proof Surfaces\n- API: /api/v1/github/repository?owner=acme&repo=cyvx\n- API: /api/v1/github/health?owner=acme&repo=cyvx\n- API: /api/v1/github/proof?owner=acme&repo=cyvx\n- API: /api/v1/repository-health?owner=acme&repo=cyvx\n- API: /api/v1/proof?owner=acme&repo=cyvx\n- CLI: repository-health, repo-health, proof, github, github-health, github-proof\n',
    '\n## Reality Engine vΩ\n- API: `GET /api/v1/reality-engine`\n- CLI: `reality-engine`\n- Purpose: compress architecture into verified prediction -> outcome -> error -> learning loops.\n',
    rel + " readme"
  );
  source = replaceOnce(
    source,
    '- Executive Intelligence: answers, forecasts, recommendations, and risk assessments\n',
    '- Executive Intelligence: answers, forecasts, recommendations, and risk assessments\n- Reality Engine: predictions, outcomes, calibration, proof, and baseline comparison\n',
    rel + " architecture"
  );
  write(rel, source);
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
    '      "/api/v1/proof",\n',
    '      "/api/v1/proof",\n      "/api/v1/reality-engine",\n',
    rel + " endpoints"
  );
  write(rel, source);
}

function appendRealityTest() {
  const rel = "test/platform.test.js";
  const source = read(rel);
  if (source.includes("reality engine compresses the thesis into evidence")) return;
  const insert = `

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
  write(rel, source + insert);
}

try {
  updatePlatformIndex();
  updateApi();
  updateCli();
  updateUiHtml();
  updateUiApp();
  updateReadme();
  updateBuild();
  appendRealityTest();
  console.log("Reality engine updates applied.");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
