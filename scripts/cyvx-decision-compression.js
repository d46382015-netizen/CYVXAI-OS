#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function read(p){ try { return fs.readFileSync(p,"utf8"); } catch { return ""; } }
function json(p){ try { return JSON.parse(read(p)); } catch { return null; } }
function write(p,v){
  fs.mkdirSync(path.dirname(p),{recursive:true});
  fs.writeFileSync(p, typeof v==="string" ? v : JSON.stringify(v,null,2));
}

const flywheel = json("data/intelligence/flywheel-state.json") || {};
const opportunities = json("data/opportunities/opportunity-ledger.json") || { opportunities: [] };
const economics = json("data/economics/economic-rankings.json") || { rankings: [] };
const live = json("data/runtime/live-dashboard-state.json") || {};

const topOpportunity =
  (economics.rankings && economics.rankings[0]) ||
  (opportunities.opportunities && opportunities.opportunities[0]) ||
  { title: "Build Prediction Ledger + Simulation Ranking", economic_score: 0.5 };

const result = {
  generated_at: new Date().toISOString(),

  executive_view: {
    top_constraint:
      flywheel.top_constraint ||
      live.topConstraint ||
      "Need more real outcomes to compound intelligence.",

    top_opportunity:
      topOpportunity.title,

    highest_roi_mission:
      topOpportunity.title,

    biggest_risk:
      "Architecture growth outpacing real-world outcome volume.",

    single_next_action:
      "Collect and process 10 real realities through the flywheel and capture outcomes."
  },

  strategic_horizons: {
    now: [
      "Run 10 real reality analyses",
      "Generate predictions for each",
      "Capture outcomes"
    ],

    days_30: [
      "Build outcome history",
      "Build prediction accuracy tracking",
      "Reach 50+ outcome records"
    ],

    days_90: [
      "Launch public intelligence layer",
      "Create proof library",
      "Enable continuous reality ingestion"
    ]
  },

  leverage_map: [
    {
      rank: 1,
      leverage_point: "Outcome Volume",
      reason: "Every outcome improves trust, prediction accuracy, and learning."
    },
    {
      rank: 2,
      leverage_point: "Prediction Ledger",
      reason: "Creates measurable intelligence instead of static analysis."
    },
    {
      rank: 3,
      leverage_point: "Continuous Reality Ingestion",
      reason: "Keeps CYVX learning without manual uploads."
    }
  ],

  status: "executive-ready"
};

write("data/decision-compression/executive-state.json", result);

write("docs/evidence/CYVX_EXECUTIVE_DECISION_REPORT.md", `# CYVX Executive Decision Report

Generated: ${result.generated_at}

## Top Constraint
${result.executive_view.top_constraint}

## Top Opportunity
${result.executive_view.top_opportunity}

## Highest ROI Mission
${result.executive_view.highest_roi_mission}

## Biggest Risk
${result.executive_view.biggest_risk}

## Single Next Action
${result.executive_view.single_next_action}

## NOW
${result.strategic_horizons.now.map(x => "- " + x).join("\n")}

## 30 DAYS
${result.strategic_horizons.days_30.map(x => "- " + x).join("\n")}

## 90 DAYS
${result.strategic_horizons.days_90.map(x => "- " + x).join("\n")}

## Top 3 Leverage Points
${result.leverage_map.map(x =>
`- #${x.rank} ${x.leverage_point}: ${x.reason}`).join("\n")}
`);

console.log("CYVX Decision Compression Complete");
console.log("Next Action:", result.executive_view.single_next_action);
