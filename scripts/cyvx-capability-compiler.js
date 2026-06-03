#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function read(p){ try { return fs.readFileSync(p,"utf8"); } catch { return ""; } }
function json(p){ try { return JSON.parse(read(p)); } catch { return null; } }
function write(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p, typeof v==="string" ? v : JSON.stringify(v,null,2)); }

const flywheel = json("data/intelligence/flywheel-state.json") || {};
const decision = json("data/decision-compression/executive-state.json") || {};
const meta = json("data/meta-intelligence/meta-intelligence-state.json") || {};
const live = json("data/runtime/live-dashboard-state.json") || {};

const topConstraint =
  decision.executive_view?.top_constraint ||
  flywheel.top_constraint ||
  live.topConstraint ||
  "CYVX needs a system that turns capability gaps into buildable implementation plans.";

const nextAction =
  decision.executive_view?.single_next_action ||
  flywheel.next_best_action ||
  live.nextAction ||
  "Build a Capability Compiler.";

const missingCapabilities = [
  "Prediction Ledger",
  "Simulation Ranking",
  "Continuous Reality Ingestion",
  "Outcome History UI",
  "Economic Mission Ranking",
  "Self-Improvement Execution Queue",
  "Public Proof Surface",
  "Capability Compiler"
];

const selectedCapability =
  /prediction/i.test(nextAction) ? "Prediction Ledger + Simulation Ranking" :
  /outcome/i.test(nextAction) ? "Outcome History + Trust Calibration" :
  /reality|ingestion/i.test(nextAction) ? "Continuous Reality Ingestion" :
  "Capability Compiler";

const compiled = {
  id: "capability-" + Date.now(),
  created_at: new Date().toISOString(),
  compiler: "CYVX Capability Compiler",
  selected_capability: selectedCapability,
  source_constraint: topConstraint,
  source_next_action: nextAction,
  purpose: "Turn CYVX intelligence outputs into concrete build plans that expand the platform automatically.",
  specification: {
    user_story: `As CYVX, I need ${selectedCapability} so the platform can convert intelligence into compounding execution.`,
    inputs: [
      "runtime state",
      "decision compression",
      "flywheel state",
      "outcomes",
      "evidence",
      "repo reality"
    ],
    outputs: [
      "implementation plan",
      "task backlog",
      "test plan",
      "evidence plan",
      "measurement plan",
      "dashboard updates"
    ],
    success_metric: `${selectedCapability} generates measurable improvement in mission quality, evidence, trust, or execution speed.`
  },
  architecture: {
    folders: [
      `core/${selectedCapability.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`,
      `data/${selectedCapability.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`,
      "docs/evidence"
    ],
    modules: [
      "schema",
      "engine",
      "runtime-state",
      "evidence-report",
      "dashboard-surface",
      "tests"
    ]
  },
  tasks: [
    {
      id: "TASK-001",
      title: "Define capability schema",
      priority: "highest",
      status: "ready"
    },
    {
      id: "TASK-002",
      title: "Create engine script",
      priority: "highest",
      status: "ready"
    },
    {
      id: "TASK-003",
      title: "Generate runtime state artifact",
      priority: "high",
      status: "ready"
    },
    {
      id: "TASK-004",
      title: "Create evidence report",
      priority: "high",
      status: "ready"
    },
    {
      id: "TASK-005",
      title: "Wire dashboard state",
      priority: "medium",
      status: "next"
    },
    {
      id: "TASK-006",
      title: "Add validation and test coverage",
      priority: "medium",
      status: "next"
    }
  ],
  tests: [
    "script runs without external services",
    "runtime artifact is created",
    "evidence report is created",
    "dashboard live state updates",
    "Omega100 still passes",
    "git status contains only intended changes"
  ],
  evidence_plan: [
    "Store compiled capability spec",
    "Store generated tasks",
    "Store build report",
    "Record expected outcome",
    "Capture actual outcome after implementation",
    "Update trust after result"
  ],
  measurement_plan: {
    baseline: "manual feature planning and one-off commands",
    target: "capability gap becomes implementation plan in one command",
    metrics: [
      "time_to_plan",
      "tasks_generated",
      "evidence_created",
      "validation_passed",
      "outcome_recorded"
    ]
  },
  next_build_command: `Build ${selectedCapability} from this compiled plan.`,
  status: "compiled"
};

write("core/capability-compiler/README.md", "# CYVX Capability Compiler\n\nReality → Capability Gap → Specification → Architecture → Tasks → Tests → Evidence → Measurement → Outcome\n");
write("data/capability-compiler/latest-compiled-capability.json", compiled);
write("data/runtime/live-dashboard-state.json", {
  ...live,
  health: "active",
  modelHealth: "capability-compiler",
  trust: Math.max(Number(live.trust || 90), 91),
  topConstraint,
  nextAction: `Compile and build: ${selectedCapability}`,
  selectedCapability,
  capabilityCompiler: {
    status: "active",
    latest: compiled.id,
    selected_capability: selectedCapability
  }
});

write("docs/evidence/CYVX_CAPABILITY_COMPILER.md",
`# CYVX Capability Compiler

Generated: ${compiled.created_at}

## Selected Capability

${compiled.selected_capability}

## Source Constraint

${compiled.source_constraint}

## Purpose

${compiled.purpose}

## Specification

User Story: ${compiled.specification.user_story}

Success Metric: ${compiled.specification.success_metric}

## Architecture

${compiled.architecture.modules.map(x=>"- "+x).join("\n")}

## Tasks

${compiled.tasks.map(t=>`- ${t.id}: ${t.title} [${t.priority}]`).join("\n")}

## Tests

${compiled.tests.map(x=>"- "+x).join("\n")}

## Evidence Plan

${compiled.evidence_plan.map(x=>"- "+x).join("\n")}

## Measurement Plan

Target: ${compiled.measurement_plan.target}

## Next Build Command

${compiled.next_build_command}
`);

console.log("CYVX Capability Compiler active.");
console.log("Selected Capability:", selectedCapability);
console.log("Next:", compiled.next_build_command);
