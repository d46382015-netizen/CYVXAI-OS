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

function insertAfter(source, needle, insert, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error("Missing anchor for " + label);
  return source.slice(0, index + needle.length) + insert + source.slice(index + needle.length);
}

function updateRealityEngineCore() {
  const rel = "core/platform/reality_engine_v1.js";
  let source = read(rel);
  source = insertAfter(
    source,
    '    const endgameModel = buildEndgameModel({\n      verifiedOutcomeVolume,\n      loopCount,\n    });\n',
    '\n    const realityOsModel = {\n      name: "RealityOS vΩ",\n      reality: "Reality",\n      layers: {\n        observation: ["Data Collection", "Sensors", "Reports", "Transactions", "Events", "Readings"],\n        reality_model: ["Entity Engine", "Relationship Engine", "Flow Engine", "Access Engine", "Control Engine", "Time Engine"],\n        intelligence: ["Reading Engine", "Signal Engine", "Trust Engine", "Prediction Engine", "Opportunity Engine", "Risk Engine", "Bottleneck Engine", "Intelligence Engine"],\n        compression: ["Correlation", "Classification", "Prioritization", "Attention Engine", "Executive Summaries"],\n        operational: ["Decision Engine", "Priority Engine", "Allocation Engine", "Coordination Engine", "Execution Engine", "Optimization Engine"],\n        learning: ["Outcome Engine", "Feedback Engine", "Learning Engine", "Confidence Updates", "Meta Engine"],\n        interface: ["Dashboard", "Mobile Interface", "Alerts", "Recommendations", "Missions", "Executive Console"],\n      },\n      phone_as_viewport: "The phone is the final presentation layer, not the operating core.",\n    };\n\n    const entityModel = {\n      abstraction: "Everything = Entity",\n      attributes: ["Identity", "State", "Resources", "Capabilities", "Constraints", "Incentives", "Relationships", "Flows", "Access", "Control", "Readings", "Signals", "Predictions", "Opportunities", "Risks", "Bottlenecks", "Priority", "Trust", "Outcomes", "Time"],\n      entities: ["People", "Organizations", "Cities", "States", "Countries", "Roads", "Airports", "Utilities", "Power Plants", "Data Centers", "Hospitals", "Universities", "Supply Chains", "Projects", "AI Agents", "Markets", "Events"],\n    };\n\n    const compressionPrinciple = {\n      raw_reality: ["Millions of Events", "Millions of Entities", "Millions of Relationships"],\n      compressed_reality: ["Thousands of Signals", "Hundreds of Issues", "Dozens of Priorities", "Top Actions"],\n      principle: "The value is created by compressing reality into attention, not by expanding dashboards.",\n    };\n\n    const executiveCore = [\n      "Observe",\n      "Read",\n      "Understand",\n      "Signal",\n      "Predict",\n      "Identify Bottlenecks",\n      "Identify Opportunities",\n      "Prioritize",\n      "Decide",\n      "Allocate",\n      "Coordinate",\n      "Execute",\n      "Measure",\n      "Learn",\n      "Improve",\n    ];\n\n    const digitalTwinUsa = {\n      geography: "United States",\n      entities: ["States", "Counties", "Cities", "Organizations"],\n      networks: ["Infrastructure", "Supply Chains", "Energy Networks", "Financial Networks", "Information Networks", "Transportation Networks", "Workforce Networks", "Decision Networks"],\n      goal: "Discover what exists, what is connected, what is changing, what matters, what is constrained, what is growing, what is breaking, and what should happen next.",\n    };\n\n    const mobileMissionControl = {\n      layers: ["Reality", "Observation", "Graph", "Signals", "Intelligence", "Compression", "Attention", "Decision", "Phone"],\n      top_views: ["Top Bottleneck", "Top Opportunity", "Top Risk", "Top Action"],\n      purpose: "The phone displays the highest-value representation of reality.",\n    };\n',
    rel + " reality os constants"
  );
  source = replaceOnce(
    source,
    '      one_sentence_compression: oneSentenceCompression,\n      thesis_status: intelligenceMap.thesis_status,\n',
    '      one_sentence_compression: oneSentenceCompression,\n      reality_os_vOmega: realityOsModel,\n      everything_is_entity: entityModel,\n      compression_principle: compressionPrinciple,\n      executive_core: executiveCore,\n      digital_twin_usa: digitalTwinUsa,\n      mobile_mission_control: mobileMissionControl,\n      thesis_status: intelligenceMap.thesis_status,\n',
    rel + " reality os return"
  );
  source = replaceOnce(
    source,
    '    const oneSentenceCompression = "CYVX succeeds only if repeated prediction-to-outcome loops reduce error and improve decisions more than baseline human judgment.";\n',
    '    const oneSentenceCompression = "CYVX succeeds only if repeated prediction-to-outcome loops reduce error and improve decisions more than baseline human judgment, with the phone acting as the final presentation layer of a larger RealityOS stack.";\n',
    rel + " compression"
  );
  write(rel, source);
}

function updateUi() {
  const rel = "ui/index.html";
  let source = read(rel);
  source = replaceOnce(
    source,
    '<h2>Reality Engine vΩ</h2>\n              <p>Evidence-first compression of predictions, outcomes, error, learning, and calibration.</p>\n',
    '<h2>RealityOS vΩ</h2>\n              <p>Evidence-first compression of predictions, outcomes, error, learning, calibration, and mobile presentation.</p>\n',
    rel + " reality panel heading"
  );
  source = replaceOnce(
    source,
    'This view is falsifiable: if loop count rises while error does not fall, the thesis weakens.',
    'This view is falsifiable: if loop count rises while error does not fall, the thesis weakens. The phone is the viewport, not the core.',
    rel + " reality panel note"
  );
  write(rel, source);
}

function updateReadme() {
  const rel = "README.md";
  let source = read(rel);
  if (!source.includes("RealityOS vΩ")) {
    source += `\n## RealityOS vΩ\n- RealityOS layers the repo around observation, modeling, intelligence, compression, operation, learning, and interface.\n- The phone is the final presentation layer of a much larger system.\n- RealityEngine now exposes the layered model through \`GET /api/v1/reality-engine\`.\n`;
  }
  write(rel, source);
}

try {
  updateRealityEngineCore();
  updateUi();
  updateReadme();
  console.log("RealityOS merge applied.");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
