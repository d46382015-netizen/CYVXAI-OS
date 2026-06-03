#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function write(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p, typeof v==="string" ? v : JSON.stringify(v,null,2)); }
const analysis = JSON.parse(fs.readFileSync("data/runtime/cross-repo-analysis.json","utf8"));

const mission = {
  id: "cross-repo-mission-" + Date.now(),
  title: "Integrate Multi-Repo Intelligence Into CYVX",
  objective: "Use CYVXAI-OS as command layer while extracting agent, workflow, and proof primitives from the 3 support repos.",
  phases: [
    "Map each repo to CYVX primitive",
    "Extract reusable concepts without copying incompatible code",
    "Create CYVX connector specs for agents, workflows, and SBOM proof",
    "Generate one dashboard card per repo role",
    "Create evidence-backed integration backlog"
  ],
  repo_roles: analysis.repositories.map(r => ({
    repo: r.name,
    role: r.role,
    leverage_score: r.leverage_score,
    integration_value:
      r.role === "primary-platform" ? "Command cockpit and product shell" :
      r.role === "agent-orchestration" ? "Agent lifecycle and coordination model" :
      r.role === "workflow-execution" ? "Executable workflow automation layer" :
      r.role === "security-sbom-proof" ? "Dependency proof, SBOM, and repo risk intelligence" :
      "Support intelligence"
  })),
  next_best_action: "Build CYVX connector specs for agent orchestration, workflow execution, and SBOM proof.",
  expected_outcome: "CYVX becomes a multi-repo operating layer instead of a single-repo dashboard.",
  confidence: 0.87,
  status: "ready"
};

write("data/runtime/cross-repo-mission.json", mission);
write("docs/evidence/CYVX_CROSS_REPO_MISSION.md",
`# CYVX Cross-Repo Mission

## Mission
${mission.title}

## Objective
${mission.objective}

## Next Best Action
${mission.next_best_action}

## Expected Outcome
${mission.expected_outcome}

## Phases
${mission.phases.map(x=>"- "+x).join("\n")}

## Repo Roles
${mission.repo_roles.map(r=>`- ${r.repo}: ${r.integration_value} | score ${r.leverage_score}`).join("\n")}
`);

console.log(JSON.stringify(mission,null,2));
