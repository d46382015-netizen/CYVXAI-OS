"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const file = (...x) => path.join(ROOT, ...x);

function readJson(rel, fallback) {
  try { return JSON.parse(fs.readFileSync(file(rel), "utf8")); }
  catch { return fallback; }
}

function writeJson(rel, value) {
  fs.mkdirSync(path.dirname(file(rel)), { recursive: true });
  fs.writeFileSync(file(rel), JSON.stringify(value, null, 2));
}

const COUNCIL = [
  {
    id: "argus",
    name: "ARGUS",
    perspective: "Reality",
    watches: ["evidence", "contradictions", "drift", "constraints"],
    asks: "What is actually true?"
  },
  {
    id: "odyssey",
    name: "ODYSSEY",
    perspective: "Possibility",
    watches: ["futures", "alternatives", "opportunities", "timing"],
    asks: "What could become true?"
  },
  {
    id: "prometheus",
    name: "PROMETHEUS",
    perspective: "Creation",
    watches: ["assets", "systems", "products", "automation"],
    asks: "What can we create?"
  },
  {
    id: "solon",
    name: "SOLON",
    perspective: "Judgment",
    watches: ["risk", "leverage", "tradeoffs", "sequencing"],
    asks: "What is the wisest path?"
  },
  {
    id: "aurora",
    name: "AURORA",
    perspective: "Growth",
    watches: ["distribution", "compounding", "revenue", "learning"],
    asks: "How do we multiply outcomes?"
  }
];

function scoreReality(input = {}) {
  const text = JSON.stringify(input).toLowerCase();
  return {
    distribution: /customer|audience|content|sales|growth|users|traffic|distribution/.test(text) ? 82 : 43,
    capital: /money|funding|revenue|cash|profit|capital/.test(text) ? 76 : 38,
    execution: /build|ship|launch|execute|deploy|finish/.test(text) ? 88 : 72,
    uncertainty: /unknown|stuck|confused|risk|guess|maybe/.test(text) ? 79 : 41,
    assetNeed: /asset|website|proof|product|content|automation|system/.test(text) ? 86 : 54
  };
}

function deliberate(input = {}) {
  const now = new Date().toISOString();
  const goal = input.goal || input.reality || input.objective || "Increase agency through one measurable outcome.";
  const scores = scoreReality(input);
  const memory = readJson("data/agency-runtime/memory.json", { sessions: [], missions: [], decisions: [], assets: [], lessons: [] });

  const perspectives = COUNCIL.map(member => {
    let finding;
    let recommendation;

    if (member.id === "argus") {
      finding = scores.distribution > 70 ? "Distribution is the strongest observed bottleneck." : "Reality signal is incomplete; more evidence is needed.";
      recommendation = "Verify the constraint with one measurable external signal.";
    }
    if (member.id === "odyssey") {
      finding = "The highest upside future comes from converting the goal into a visible outcome loop.";
      recommendation = "Generate three future paths and choose the fastest validated path.";
    }
    if (member.id === "prometheus") {
      finding = scores.assetNeed > 70 ? "A user-facing asset should be built next." : "The next asset must directly support execution.";
      recommendation = "Create one reusable asset that turns attention into action.";
    }
    if (member.id === "solon") {
      finding = scores.uncertainty > 70 ? "The risk is acting before reality is verified." : "The strongest path is narrow execution.";
      recommendation = "Choose the smallest action with the clearest feedback loop.";
    }
    if (member.id === "aurora") {
      finding = scores.capital > 70 || scores.distribution > 70 ? "Growth depends on distribution and compounding proof." : "Learning loops must compound before scale.";
      recommendation = "Prioritize actions that create reusable distribution, trust, or revenue."
    }

    return {
      ...member,
      status: "autonomous",
      current_focus: finding,
      recommendation,
      confidence: Math.max(72, Math.min(96, Math.round((scores.execution + scores.distribution + scores.assetNeed) / 3))),
      observed_at: now
    };
  });

  const mission = {
    id: "agency-mission-" + Date.now(),
    title: "Run one autonomous agency loop",
    goal,
    constraint: scores.distribution > scores.capital ? "Distribution bottleneck" : "Capital bottleneck",
    opportunity: "Create a visible, measurable outcome loop that compounds trust and execution.",
    next_action: "Execute the smallest measurable mission, capture the result, and let AEON update the model.",
    owner: "AEON Ω",
    status: "queued",
    success_metric: "A real outcome is captured and converted into a lesson, asset, or next mission.",
    created_at: now
  };

  const decision = {
    id: "decision-" + Date.now(),
    question: "What should CYVX do next?",
    synthesis: "AEON Ω selected the path with the clearest reality signal, smallest execution surface, and highest compounding upside.",
    selected_path: mission.next_action,
    rejected_paths: [
      { path: "Add more UI features", reason: "Lower leverage until agency loop is stronger." },
      { path: "Expand agent roles", reason: "Roles are weaker than perspective-based intelligence." }
    ],
    confidence: 91,
    created_at: now
  };

  const asset = {
    id: "asset-" + Date.now(),
    title: "Autonomous Agency Loop",
    type: "runtime primitive",
    purpose: "Convert reality into council deliberation, mission creation, decision memory, and learning.",
    status: "active",
    created_at: now
  };

  const session = {
    id: "council-session-" + Date.now(),
    kernel: "AEON Ω",
    goal,
    scores,
    perspectives,
    mission,
    decision,
    asset,
    autonomous: true,
    created_at: now
  };

  memory.sessions.unshift(session);
  memory.missions.unshift(mission);
  memory.decisions.unshift(decision);
  memory.assets.unshift(asset);
  memory.sessions = memory.sessions.slice(0, 50);
  memory.missions = memory.missions.slice(0, 100);
  memory.decisions = memory.decisions.slice(0, 100);
  memory.assets = memory.assets.slice(0, 100);
  memory.updated_at = now;

  writeJson("data/agency-runtime/memory.json", memory);
  writeJson("data/agency-runtime/latest-session.json", session);
  writeJson("data/agency-runtime/latest-mission.json", mission);
  writeJson("data/agency-runtime/latest-decision.json", decision);

  return session;
}

function snapshot() {
  const memory = readJson("data/agency-runtime/memory.json", { sessions: [], missions: [], decisions: [], assets: [], lessons: [] });
  const latest = readJson("data/agency-runtime/latest-session.json", null);
  return {
    powered_by: "CYVX Ω",
    runtime: "Autonomous Agency",
    kernel: "AEON Ω",
    autonomous: true,
    council: COUNCIL,
    latest_session: latest,
    memory_summary: {
      sessions: memory.sessions.length,
      missions: memory.missions.length,
      decisions: memory.decisions.length,
      assets: memory.assets.length,
      lessons: memory.lessons.length
    },
    next_action: latest?.mission?.next_action || "Run the first autonomous agency loop."
  };
}

module.exports = { COUNCIL, deliberate, snapshot };
