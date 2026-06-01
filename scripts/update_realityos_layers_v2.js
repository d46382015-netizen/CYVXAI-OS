"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const FILE = path.join(ROOT, "core/platform/reality_engine_v1.js");

let s = fs.readFileSync(FILE, "utf8");

s = s.replace(
  /const realityOsModel = \{[\s\S]*?\n    \};\n\n    const entityModel = \{/,
  `const realityOsModel = {
      name: "RealityOS vΩ",
      reality: "Reality",
      layers: {
        observation: ["Observe", "Read", "Orient", "Understand"],
        reality: ["Entity Engine", "Relationship Engine", "Flow Engine", "Access Engine", "Control Engine", "Time Engine"],
        intelligence: ["Signal Engine", "Trust Engine", "Prediction Engine", "Opportunity Engine", "Risk Engine", "Bottleneck Engine", "Causality Engine", "Intelligence Engine"],
        decision: ["Goal Engine", "Assumption Engine", "Priority Engine", "Intervention Engine", "Value Engine", "Decision Engine"],
        operations: ["Allocation Engine", "Coordination Engine", "Execution Engine", "Optimization Engine", "Governance Engine"],
        learning: ["Measure", "Compare", "Calibrate", "Learn", "Knowledge Gap Engine", "Meta Engine"],
        resilience: ["Resilience Engine", "Recovery", "Adaptation", "Continuity Reality"],
        interface: ["Dashboard", "Mobile Interface", "Alerts", "Recommendations", "Missions", "Executive Console"],
      },
      phone_as_viewport: "The phone is the final presentation layer, not the operating core.",
    };

    const entityModel = {`
);

s = s.replace(
  /const executiveCore = \[[\s\S]*?\n    \];/,
  `const executiveCore = [
      "Observe",
      "Read",
      "Orient",
      "Understand",
      "Identify Signals",
      "Identify Causes",
      "Identify Constraints",
      "Identify Opportunities",
      "Identify Interventions",
      "Evaluate Value",
      "Prioritize",
      "Decide",
      "Allocate",
      "Coordinate",
      "Execute",
      "Measure",
      "Compare",
      "Calibrate",
      "Learn",
      "Update Assumptions",
      "Identify Knowledge Gaps",
      "Improve",
      "Repeat",
    ];`
);

s = s.replace(
  /const mobileMissionControl = \{[\s\S]*?\n    \};/,
  `const mobileMissionControl = {
      layers: ["Reality", "Observation", "Graph", "Signals", "Intelligence", "Compression", "Attention", "Decision", "Phone"],
      top_views: ["Top Bottleneck", "Top Opportunity", "Top Risk", "Top Action"],
      purpose: "The phone displays the highest-value representation of reality.",
      output_pattern: {
        top_bottleneck: "Workforce shortage",
        top_opportunity: "Regional logistics expansion",
        top_risk: "Grid capacity constraint",
        top_action: "Allocate resources to workforce pipeline",
      },
    };`
);

s = s.replace(
  /const systemMap = \{[\s\S]*?\n    \};/,
  `const systemMap = {
      core_flow: [
        "Observe",
        "Read",
        "Orient",
        "Understand",
        "Identify Signals",
        "Identify Causes",
        "Identify Constraints",
        "Identify Opportunities",
        "Identify Interventions",
        "Evaluate Value",
        "Prioritize",
        "Decide",
        "Allocate",
        "Coordinate",
        "Execute",
        "Measure",
        "Compare",
        "Calibrate",
        "Learn",
        "Update Assumptions",
        "Identify Knowledge Gaps",
        "Improve",
        "Repeat",
      ],
      operating_rule: "If the loop does not end in verified outcomes, the system is still reporting, not learning.",
      missing_link: "Large volumes of verified outcome data",
    };`
);

s = s.replace(
  '    const oneSentenceCompression = "CYVX succeeds only if repeated prediction-to-outcome loops reduce error and improve decisions more than baseline human judgment, with the phone acting as the final presentation layer of a larger RealityOS stack.";',
  '    const oneSentenceCompression = "CYVX succeeds only if repeated prediction-to-outcome loops reduce error, improve decisions, and compound into a RealityOS stack with the phone as the final presentation layer.";'
);

s = s.replace(
  /      reality_os_vOmega: realityOsModel,\n      everything_is_entity: entityModel,\n      compression_principle: compressionPrinciple,\n      executive_core: executiveCore,\n      digital_twin_usa: digitalTwinUsa,\n      mobile_mission_control: mobileMissionControl,/,
  `      reality_os_vOmega: realityOsModel,
      everything_is_entity: entityModel,
      compression_principle: compressionPrinciple,
      executive_core: executiveCore,
      digital_twin_usa: digitalTwinUsa,
      mobile_mission_control: mobileMissionControl,
      operating_loop: ["Observe", "Read", "Orient", "Understand", "Identify Signals", "Identify Causes", "Identify Constraints", "Identify Opportunities", "Identify Interventions", "Evaluate Value", "Prioritize", "Decide", "Allocate", "Coordinate", "Execute", "Measure", "Compare", "Calibrate", "Learn", "Update Assumptions", "Identify Knowledge Gaps", "Improve", "Repeat"],`
);

fs.writeFileSync(FILE, s);
console.log("RealityOS layer model updated.");
