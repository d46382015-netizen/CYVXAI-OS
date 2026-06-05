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

  const classified =
    raw.includes("money") || raw.includes("income") || raw.includes("revenue") ? "income" :
    raw.includes("customer") || raw.includes("client") || raw.includes("sales") ? "sales" :
    raw.includes("content") || raw.includes("tiktok") || raw.includes("youtube") || raw.includes("video") ? "content" :
    raw.includes("repo") || raw.includes("github") || raw.includes("code") || raw.includes("app") ? "product" :
    raw.includes("health") || raw.includes("fitness") || raw.includes("sober") ? "life" :
    "agency";

  const playbooks = {
    income: {
      constraint: "No repeatable path from skill to paid demand.",
      opportunity: "Package one specific outcome into a simple paid offer and test it with real buyers.",
      mission: "Create and test one paid offer",
      nba: "Write one offer, identify 10 reachable buyers, send 10 messages, and record replies."
    },
    sales: {
      constraint: "No proof-backed distribution loop.",
      opportunity: "Turn one result, demo, or capability into a buyer-specific proof pack.",
      mission: "Acquire one proof conversation",
      nba: "Create a short proof pack and contact 5 buyers with one clear outcome."
    },
    content: {
      constraint: "Content lacks a repeatable production-to-conversion system.",
      opportunity: "Turn one core idea into a batch of posts with a measurable call to action.",
      mission: "Publish one content batch",
      nba: "Create 10 hooks, 3 short scripts, 1 CTA, and publish the best piece today."
    },
    product: {
      constraint: "Product capability is not compressed into one obvious user value moment.",
      opportunity: "Make the homepage prove one outcome in under 60 seconds.",
      mission: "Ship one undeniable value moment",
      nba: "Make the first screen ask for a goal and return score, constraint, mission, and outcome capture."
    },
    life: {
      constraint: "Daily actions are not connected to a measurable recovery or growth loop.",
      opportunity: "Convert goals into a visible daily mission and proof record.",
      mission: "Complete one stabilizing daily mission",
      nba: "Choose one action that improves tomorrow, complete it, and record the result."
    },
    agency: {
      constraint: "Intent is not yet converted into a measurable outcome loop.",
      opportunity: "Create one clear mission from the goal and capture the result.",
      mission: "Complete one agency loop",
      nba: "Define the goal, choose the smallest measurable action, execute it, and record the outcome."
    }
  };

  const selected = playbooks[classified];
  const topConstraint = constraints[0] || selected.constraint;
  const opportunity = selected.opportunity;

  const mission = {
    id: "mission-" + Date.now(),
    title: selected.mission,
    goal,
    top_constraint: topConstraint,
    opportunity,
    next_best_action: selected.nba,
    status: "active",
    created_at: now,
    success_metric: "A specific action is completed and recorded as evidence, not just planned."
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
