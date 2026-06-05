"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const p = (...x) => path.join(ROOT, ...x);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function words(x) {
  return String(x || "").toLowerCase();
}

function scoreAgency({ memory, outcomes, mission }) {
  const completed = outcomes.filter(o => o.succeeded === true).length;
  const total = outcomes.length;
  const outcomeScore = total ? Math.min(1, completed / Math.max(3, total)) : 0;
  const memoryScore = Math.min(1, (memory.goals.length + memory.constraints.length + memory.resources.length) / 20);
  const missionScore = mission ? 0.25 : 0;
  const evidenceScore = Math.min(1, total / 10);
  return Math.round((outcomeScore * 35) + (memoryScore * 20) + (missionScore * 20) + (evidenceScore * 25));
}

function createPartnerBrief(input = {}) {
  const now = new Date().toISOString();
  const goal = input.goal || input.reality || input.text || "Increase agency and create measurable outcomes.";
  const raw = words(goal + " " + JSON.stringify(input));

  const memoryFile = p("data/memory/partner-memory.json");
  const memory = readJson(memoryFile, {
    goals: [],
    constraints: [],
    resources: [],
    missions: [],
    outcomes: [],
    updated_at: null
  });

  const resources = Array.isArray(input.resources) ? input.resources : [];
  const constraints = Array.isArray(input.constraints) ? input.constraints : [];

  memory.goals.push({ value: goal, at: now });
  for (const r of resources) memory.resources.push({ value: r, at: now });
  for (const c of constraints) memory.constraints.push({ value: c, at: now });

  const topConstraint =
    constraints[0] ||
    (raw.includes("customer") || raw.includes("sales") ? "Distribution and proof are the current bottlenecks." :
    raw.includes("content") ? "Consistent content production and publishing cadence are the bottlenecks." :
    raw.includes("business") ? "The offer must be compressed into one clear buyer outcome." :
    raw.includes("repo") || raw.includes("github") ? "Existing code must be compressed into one user-facing agency loop." :
    "The next bottleneck is converting intent into one measurable mission.");

  const opportunity =
    raw.includes("money") || raw.includes("income") || raw.includes("revenue") ? "Build a proof-backed income mission that creates an asset, offer, and outreach path." :
    raw.includes("content") ? "Turn one goal into a 20-piece content batch with a measurable call to action." :
    raw.includes("business") ? "Launch one buyer-specific offer page and one outbound proof pack." :
    raw.includes("repo") || raw.includes("github") ? "Turn the running CYVX platform into CYVX Partner Alpha." :
    "Create one complete goal → mission → outcome loop.";

  const mission = {
    id: "mission-" + Date.now(),
    title: "Create one measurable agency loop",
    goal,
    top_constraint: topConstraint,
    opportunity,
    next_best_action: "Complete one visible mission, record the outcome, and update the agency score.",
    status: "active",
    created_at: now,
    success_metric: "A user can see memory, next best action, mission, outcome, and agency score in one flow."
  };

  const outcomes = readJson(p("data/outcomes/latest-captured-outcome.json"), null);
  const outcomeList = outcomes ? [outcomes, ...memory.outcomes].slice(0, 25) : memory.outcomes.slice(0, 25);

  memory.missions.unshift(mission);
  memory.updated_at = now;
  memory.missions = memory.missions.slice(0, 50);

  const agencyScore = scoreAgency({ memory, outcomes: outcomeList, mission });

  const brief = {
    powered_by: "CYVX",
    creator: "Dakota Lee Jonsgaard",
    version: "partner-alpha-1",
    created_at: now,
    primitive: "Agency",
    agency_score: agencyScore,
    proof_level: agencyScore >= 80 ? "strong" : agencyScore >= 50 ? "forming" : "early",
    goal,
    memory_summary: {
      goals: memory.goals.length,
      resources: memory.resources.length,
      constraints: memory.constraints.length,
      missions: memory.missions.length,
      outcomes: outcomeList.length
    },
    top_constraint: topConstraint,
    opportunity,
    mission,
    daily_agency_brief: {
      completed: outcomeList.filter(o => o.succeeded === true).length,
      found: 1,
      blocked_by: topConstraint,
      recommended: mission.next_best_action
    }
  };

  memory.outcomes = outcomeList;
  writeJson(memoryFile, memory);
  writeJson(p("data/partner/latest-brief.json"), brief);
  writeJson(p("data/missions/latest-partner-mission.json"), mission);

  const live = readJson(p("data/runtime/live-dashboard-state.json"), {});
  writeJson(p("data/runtime/live-dashboard-state.json"), {
    ...live,
    health: "active",
    agencyScore,
    topConstraint,
    nextBestAction: mission.next_best_action,
    missionsActive: Math.max(Number(live.missionsActive || 0), 1),
    outcomesToday: Number(live.outcomesToday || 0),
    latestPartnerBrief: brief
  });

  writeText(p("docs/evidence/CYVX_PARTNER_ALPHA.md"), `# CYVX Partner Alpha

Generated: ${now}

## Primitive
Agency

## Goal
${goal}

## Agency Score
${agencyScore}

## Top Constraint
${topConstraint}

## Opportunity
${opportunity}

## Mission
${mission.title}

## Next Best Action
${mission.next_best_action}

## Success Metric
${mission.success_metric}
`);

  return brief;
}

module.exports = { createPartnerBrief };
