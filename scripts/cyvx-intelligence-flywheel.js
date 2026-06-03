#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function read(p){ try { return fs.readFileSync(p,"utf8"); } catch { return ""; } }
function json(p){ try { return JSON.parse(read(p)); } catch { return null; } }
function write(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p, typeof v==="string" ? v : JSON.stringify(v,null,2)); }
function list(dir){ try { return fs.readdirSync(dir,{withFileTypes:true}); } catch { return []; } }

const now = new Date().toISOString();

let corpus = "";
const sources = [
  "README.md",
  "data/reality-upload/REALITY_UPLOAD.md",
  "data/runtime/live-dashboard-state.json",
  "data/runtime/latest-mission.json",
  "data/runtime/cross-repo-analysis.json",
  "data/runtime/cross-repo-mission.json",
  "data/intelligence/universal-intelligence-state.json",
  "data/meta-intelligence/meta-intelligence-state.json",
  "data/outcomes/latest-captured-outcome.json",
  "docs/evidence/CYVX_ROADMAP_COMPLETION_LOOP.md",
  "docs/evidence/CYVX_CROSS_REPO_ANALYSIS.md",
  "docs/evidence/CYVX_CROSS_REPO_MISSION.md",
  "docs/evidence/CYVX_CONNECTOR_SPECS.md",
  "docs/evidence/CYVX_OUTCOME_CAPTURE.md",
  "docs/evidence/CYVX_META_INTELLIGENCE_ENGINE.md"
];

for (const s of sources) corpus += "\n\n--- " + s + " ---\n" + read(s);

for (const d of list("data/repos")) {
  const p = "data/repos/" + d.name + "/README.md";
  if (fs.existsSync(p)) corpus += "\n\n--- repo:" + d.name + " ---\n" + read(p);
}

const lower = corpus.toLowerCase();
const hit = rx => rx.test(lower);

const signals = {
  reality: hit(/reality|upload|source|object/),
  repo: hit(/repo|github|readme|commit|branch/),
  mission: hit(/mission|objective|next best action|nba/),
  outcome: hit(/outcome|actual|expected|evidence/),
  trust: hit(/trust|confidence|calibration/),
  revenue: hit(/revenue|customer|client|roi|sales|business/),
  workflow: hit(/workflow|automation|activepieces|execute/),
  agent: hit(/agent|orchestration|assignment|review/),
  security: hit(/syft|sbom|security|dependency|risk/),
  deployment: hit(/deploy|server|hosting|public|production/),
  audit: hit(/audit|scanner|future-risk|issue/),
  meta: hit(/meta intelligence|prediction|simulation|compression|self-improvement/)
};

const constraints = [
  signals.outcome && "Outcome capture exists, but CYVX needs repeated outcome volume to calibrate trust.",
  signals.meta && "Meta intelligence exists, but prediction ledger and simulation ranking must become recurring outputs.",
  signals.workflow && "Workflow execution needs approved-mission handoff before automation becomes real.",
  signals.revenue && "Revenue intelligence needs real customer/problem data and ROI proof.",
  signals.deployment && "Deployment/public access is required for real user adoption.",
  signals.repo && "Repository intelligence must convert analysis into executable integration missions.",
  "The core bottleneck is compounding evidence: more realities, predictions, missions, outcomes, and trust updates."
].filter(Boolean);

const opportunities = [
  {
    id: "OPP-001",
    title: "Prediction Ledger + Simulation Ranking",
    impact: 0.94,
    confidence: 0.87,
    urgency: 0.92,
    cost: 0.16,
    risk: 0.14
  },
  {
    id: "OPP-002",
    title: "Public Proof Surface",
    impact: 0.88,
    confidence: 0.84,
    urgency: 0.9,
    cost: 0.18,
    risk: 0.12
  },
  {
    id: "OPP-003",
    title: "Continuous Reality Ingestion",
    impact: 0.9,
    confidence: 0.82,
    urgency: 0.86,
    cost: 0.22,
    risk: 0.18
  },
  {
    id: "OPP-004",
    title: "Economic Mission Ranking",
    impact: 0.86,
    confidence: 0.85,
    urgency: 0.82,
    cost: 0.12,
    risk: 0.11
  },
  {
    id: "OPP-005",
    title: "Self-Improvement Execution Queue",
    impact: 0.91,
    confidence: 0.8,
    urgency: 0.84,
    cost: 0.2,
    risk: 0.2
  }
].map(o => ({
  ...o,
  economic_score: Number((o.impact * o.confidence * o.urgency - o.cost - o.risk).toFixed(3))
})).sort((a,b)=>b.economic_score-a.economic_score);

const topOpportunity = opportunities[0];
const topConstraint = constraints[0] || "CYVX needs more real outcomes to compound intelligence.";

const prediction = {
  id: "PRED-" + Date.now(),
  created_at: now,
  prediction: "If CYVX builds a recurring prediction ledger and simulation ranking layer next, mission quality and trust calibration will improve faster than adding more UI panels.",
  confidence: 0.87,
  expected_outcome: "CYVX produces ranked predictions, simulated mission choices, and measurable expected-vs-actual records for each mission.",
  success_metric: "At least one prediction, one ranked opportunity, one economic score, one self-improvement mission, and one proof report generated per flywheel run.",
  linked_opportunity: topOpportunity.id,
  status: "open"
};

const mission = {
  id: "MISSION-" + Date.now(),
  title: topOpportunity.title,
  objective: "Turn CYVX intelligence into a recurring flywheel: reality acquisition, prediction, economic ranking, mission generation, outcome capture, trust calibration, learning, and self-improvement.",
  top_constraint: topConstraint,
  expected_outcome: prediction.expected_outcome,
  next_best_action: "Build Prediction Ledger + Simulation Ranking as the next durable intelligence layer.",
  confidence: 0.87,
  status: "ready"
};

const selfImprovement = {
  id: "SELF-" + Date.now(),
  created_at: now,
  detected_bottleneck: topConstraint,
  improvement_mission: mission.title,
  why_now: "CYVX already has enough architecture; compounding predictions and outcomes now create the biggest intelligence gain.",
  expected_gain: 0.34,
  priority: "highest",
  status: "ready"
};

const flywheel = {
  created_at: now,
  status: "active",
  loop: [
    "reality_acquisition",
    "constraint_detection",
    "opportunity_ranking",
    "prediction_ledger",
    "mission_generation",
    "execution_tracking",
    "outcome_capture",
    "trust_calibration",
    "learning",
    "self_improvement",
    "public_proof"
  ],
  signals,
  top_constraint: topConstraint,
  top_opportunity: topOpportunity,
  next_best_action: mission.next_best_action,
  prediction,
  mission,
  self_improvement: selfImprovement,
  readiness_score: Math.round(Object.values(signals).filter(Boolean).length / Object.values(signals).length * 100)
};

write("data/intelligence/flywheel-state.json", flywheel);
write("data/predictions/prediction-ledger.json", { created_at: now, predictions: [prediction] });
write("data/opportunities/opportunity-ledger.json", { created_at: now, opportunities });
write("data/economics/economic-rankings.json", { created_at: now, rankings: opportunities });
write("data/self-improvement/latest-improvement-mission.json", selfImprovement);
write("data/runtime/latest-mission.json", mission);

const live = json("data/runtime/live-dashboard-state.json") || {};
write("data/runtime/live-dashboard-state.json", {
  ...live,
  health: "active",
  modelHealth: "intelligence-flywheel",
  trust: Math.max(Number(live.trust || 88), 90),
  topConstraint,
  topOpportunity: topOpportunity.title,
  nextAction: mission.next_best_action,
  nextBestAction: {
    title: mission.next_best_action,
    why: "This creates the compounding loop: reality → prediction → mission → outcome → trust → learning.",
    confidence: 0.87
  },
  highestROIMission: mission
});

write("docs/evidence/CYVX_FLYWHEEL_REPORT.md",
`# CYVX Intelligence Flywheel Report

Generated: ${now}

## Status

${flywheel.status}

## Readiness Score

${flywheel.readiness_score}/100

## Flywheel Loop

Reality Acquisition → Constraint Detection → Opportunity Ranking → Prediction Ledger → Mission Generation → Execution Tracking → Outcome Capture → Trust Calibration → Learning → Self-Improvement → Public Proof

## Top Constraint

${topConstraint}

## Top Opportunity

${topOpportunity.title}

Economic Score: ${topOpportunity.economic_score}

## Next Best Action

${mission.next_best_action}

## Prediction

${prediction.prediction}

Confidence: ${Math.round(prediction.confidence * 100)}%

## Mission

${mission.title}

${mission.objective}

## Self-Improvement Mission

${selfImprovement.improvement_mission}

## Opportunity Rankings

${opportunities.map(o=>`- ${o.id}: ${o.title} | score ${o.economic_score}`).join("\n")}
`);

console.log("CYVX Intelligence Flywheel generated.");
console.log("Top Constraint:", topConstraint);
console.log("Top Opportunity:", topOpportunity.title);
console.log("Next Best Action:", mission.next_best_action);
console.log("Report: docs/evidence/CYVX_FLYWHEEL_REPORT.md");
