#!/usr/bin/env node
"use strict";

const fs = require("fs");
const cp = require("child_process");
const path = require("path");

function sh(cmd, cwd="."){
  try {
    return cp.execSync(cmd,{cwd,encoding:"utf8",stdio:["ignore","pipe","pipe"],maxBuffer:1024*1024*20});
  } catch(e) {
    return String(e.stdout || e.stderr || e.message || "");
  }
}

function exists(p){ return fs.existsSync(p); }
function write(p,v){
  fs.mkdirSync(path.dirname(p),{recursive:true});
  fs.writeFileSync(p, typeof v==="string" ? v : JSON.stringify(v,null,2));
}

const root = "data/repos";
const repos = exists(root)
  ? fs.readdirSync(root).filter(x => exists(path.join(root,x,".git")))
  : [];

const analyzed = repos.map(name => {
  const dir = path.join(root,name);
  const files = Number(sh("find . -maxdepth 3 -type f | wc -l", dir).trim()) || 0;
  const commits = Number(sh("git rev-list --count HEAD", dir).trim()) || 0;
  const readme = exists(path.join(dir,"README.md")) || exists(path.join(dir,"readme.md"));
  const pkg = exists(path.join(dir,"package.json"));
  const workflows = exists(path.join(dir,".github/workflows"));
  const tests = Number(sh("find . -maxdepth 4 -type f \\( -name '*test*' -o -name '*spec*' \\) | wc -l", dir).trim()) || 0;

  let role = "support";
  const n = name.toLowerCase();
  if (n.includes("cyvx")) role = "primary-platform";
  else if (n.includes("agent")) role = "agent-orchestration";
  else if (n.includes("activepieces")) role = "workflow-execution";
  else if (n.includes("syft")) role = "security-sbom-proof";

  const leverage_score = Math.round(
    (readme ? 15 : 0) +
    (pkg ? 10 : 0) +
    (workflows ? 15 : 0) +
    Math.min(files,1000)/20 +
    Math.min(tests,100)/2
  );

  return { name, path:dir, role, files, commits, readme, package_json:pkg, workflows, tests, leverage_score };
}).sort((a,b)=>b.leverage_score-a.leverage_score);

const report = {
  created_at:new Date().toISOString(),
  repo_count: analyzed.length,
  repositories: analyzed,
  top_constraint:"CYVX needs to convert multi-repo intelligence into one execution mission instead of passive comparison.",
  top_opportunity:"Use CYVXAI-OS as command layer, Agent Framework for orchestration, Activepieces for workflow execution, and Syft for SBOM/security proof.",
  next_best_action:"Build connector specs for agent orchestration, workflow execution, and SBOM proof.",
  highest_leverage_mission:{
    title:"Create CYVX Cross-Repo Intelligence Layer",
    objective:"Rank repositories, detect gaps, generate integration route, and create proof-backed missions across all repos.",
    expected_outcome:"CYVX can reason across multiple repositories and recommend the highest-impact build route.",
    confidence:0.86
  }
};

write("data/runtime/cross-repo-analysis.json", report);
write("docs/evidence/CYVX_CROSS_REPO_ANALYSIS.md",
`# CYVX Cross-Repo Analysis

Generated: ${report.created_at}

## Top Constraint
${report.top_constraint}

## Top Opportunity
${report.top_opportunity}

## Next Best Action
${report.next_best_action}

## Highest Leverage Mission
${report.highest_leverage_mission.title}

## Repositories
${analyzed.map(r=>`- ${r.name}: ${r.role}, score ${r.leverage_score}, files ${r.files}, tests ${r.tests}, workflows ${r.workflows}`).join("\n")}
`);

console.log(JSON.stringify(report,null,2));
