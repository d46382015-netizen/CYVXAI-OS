"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");

function readJson(rel, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); }
  catch { return fallback; }
}

function agentOsSnapshot() {
  const live = readJson("data/runtime/live-dashboard-state.json", {});
  const partner = readJson("data/partner/latest-brief.json", live.latestPartnerBrief || {});
  const mission = partner.mission || readJson("data/missions/latest-partner-mission.json", {});
  const outcome = readJson("data/outcomes/latest-captured-outcome.json", null);

  const agencyScore = Number(partner.agency_score || live.agencyScore || 0);
  const trust = Number(live.trust || partner.trust || 88);
  const autonomy = Number(live.autonomy || partner.autonomy || 35);

  const agents = [
    ["Commander", "Chooses the next best mission", mission.title || "No active mission", mission.next_best_action || live.nextBestAction || "Generate Partner Brief", agencyScore],
    ["Architect", "Converts mission into system design", "Maintain Agency loop architecture", "Keep memory, mission, outcome, and score connected", trust],
    ["Executor", "Turns missions into completed artifacts", mission.title || "Awaiting executable mission", outcome?.next_best_action || "Capture outcome evidence", outcome?.succeeded ? 92 : 72],
    ["Auditor", "Verifies trust, proof, and safety", "Protect proof and runtime integrity", "Verify tests, runtime state, and outcome evidence", trust],
    ["Growth Operator", "Finds adoption and revenue motion", partner.opportunity || "Find highest-leverage adoption path", "Turn current mission into a public proof/demo", Math.max(45, agencyScore - 5)]
  ].map(([name, role, current_mission, next_action, confidence]) => ({
    name,
    role,
    status: "online",
    current_mission,
    next_action,
    confidence: Math.min(99, Math.max(45, Number(confidence || 50)))
  }));

  return {
    powered_by: "CYVX",
    primitive: "Agency",
    generated_at: new Date().toISOString(),
    agency_score: agencyScore,
    trust,
    autonomy,
    proof_level: partner.proof_level || "early",
    active_mission: mission,
    latest_outcome: outcome,
    system_next_action: mission.next_best_action || live.nextBestAction || "Run one Partner Alpha loop",
    agents
  };
}

module.exports = { agentOsSnapshot };
