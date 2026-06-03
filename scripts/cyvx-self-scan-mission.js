#!/usr/bin/env node
"use strict";

const { execFileSync } = require("child_process");
const { PlatformKernel } = require("../core/platform");

function runSelfScan() {
  const output = execFileSync(process.execPath, ["./scripts/cyvx-scan-self.js"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return JSON.parse(output);
}

function main() {
  const kernel = new PlatformKernel({ filePath: process.env.CYVX_PLATFORM_STATE });
  const scan = runSelfScan();

  const top = scan.top_constraint || {};
  const action = (scan.next_best_actions && scan.next_best_actions[0]) || {};

  const mission = kernel.createMission({
    title: scan.mission && scan.mission.title ? scan.mission.title : "CYVX Self-Scan Mission",
    objective: top.recommendation || action.title || "Resolve top CYVX operational constraint",
    expected_outcome: scan.mission && scan.mission.success_metric ? scan.mission.success_metric : "Improve CYVX operational health",
    status: "proposed",
    stage: "proposed",
    priority_score: action.priority_score || 75,
    confidence: action.confidence || scan.trust_score || 0.8,
    evidence: [
      {
        type: "self_scan",
        source: "scripts/cyvx-scan-self.js",
        health: scan.health,
        trust_score: scan.trust_score,
        top_constraint: top.title || null,
      },
    ],
    tasks: scan.mission && Array.isArray(scan.mission.tasks) ? scan.mission.tasks : [
      top.recommendation || action.title || "Resolve top constraint",
    ],
    metadata: {
      source: "self-scan",
      constraint: top,
      next_best_action: action,
      scan,
    },
  });

  let nextBestAction = null;
  if (typeof kernel.nextBestAction === "function") {
    nextBestAction = kernel.nextBestAction({
      title: action.title || top.recommendation || "Execute CYVX self-scan mission",
      mission_id: mission.id,
      confidence: action.confidence || scan.trust_score || 0.8,
      priority_score: action.priority_score || 75,
      source_ids: [mission.id],
      rationale: top.evidence || "Generated from CYVX self-scan.",
    });
  }

  console.log(JSON.stringify({
    system: "CYVX Self Scan Mission Wire",
    selfScan: scan,
    mission,
    nextBestAction,
    missions: typeof kernel.missions === "function" ? kernel.missions() : [],
    nextBestActions: typeof kernel.nextBestActions === "function" ? kernel.nextBestActions() : [],
  }, null, 2));
}

main();
