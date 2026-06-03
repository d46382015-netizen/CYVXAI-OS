#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const exists = p => fs.existsSync(path.join(root, p));
const list = p => exists(p) ? fs.readdirSync(path.join(root, p)) : [];

const topFolders = list(".").filter(f => {
  try { return fs.statSync(path.join(root, f)).isDirectory() && !f.startsWith(".") && f !== "node_modules"; }
  catch { return false; }
});

const workflows = list(".github/workflows").filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));
const workflowText = workflows.map(f => fs.readFileSync(path.join(root, ".github/workflows", f), "utf8")).join("\n");

const spine = {
  active_core: ["api","core","cli","ui","data","scripts","test","observability"],
  runtime_coordination: ["runtime","scheduler","control"],
  expansion_plugins: ["civilization","internet","ml","futures"],
  research_theory: ["physics","science","thermodynamics","formal"],
  business_identity: ["brand","legal","docs"],
};

const classified = {};
for (const [category, folders] of Object.entries(spine)) {
  classified[category] = folders.filter(f => topFolders.includes(f));
}
const known = new Set(Object.values(spine).flat());
const unclassified = topFolders.filter(f => !known.has(f) && f !== "dist");
const fragmentationScore = Math.max(0, Math.round(100 - Math.max(0, topFolders.length - 12) * 6 - unclassified.length * 10));


const observations = [
  { type: "repo_structure", signal: `${topFolders.length} top-level folders`, confidence: 0.95 },
  { type: "workflow_count", signal: `${workflows.length} GitHub workflows detected`, confidence: 0.95 },
  { type: "node_sqlite", signal: exists("db.js") && fs.readFileSync(path.join(root, "db.js"), "utf8").includes("node:sqlite") ? "native node:sqlite required" : "node:sqlite not detected", confidence: 0.9 },
  { type: "tests", signal: exists("test/platform.test.js") ? "platform tests exist" : "missing platform tests", confidence: 0.9 },
  { type: "ui", signal: exists("ui") ? "dashboard/ui exists" : "missing ui folder", confidence: 0.9 },
  { type: "api", signal: exists("api/index.js") ? "api exists" : "missing api", confidence: 0.9 },
  { type: "cli", signal: exists("cli/cyvx.js") ? "cli exists" : "missing cli", confidence: 0.9 },
  { type: "module_spine", signal: `${fragmentationScore}/100 fragmentation score`, confidence: 0.95 },
  { type: "unclassified_modules", signal: `${unclassified.length} unclassified top-level folders`, confidence: 0.95 }
];

const constraints = [];

if (workflowText.includes("node-version: 20")) {
  constraints.push({
    title: "CI Node version mismatch",
    severity: "critical",
    evidence: "GitHub workflows use Node 20 while db.js requires node:sqlite.",
    recommendation: "Upgrade workflows to Node 22."
  });
}

if (exists(".github/workflows/terraform.yml") && !exists("main.tf")) {
  constraints.push({
    title: "Terraform workflow has no Terraform project",
    severity: "high",
    evidence: "terraform.yml exists but main.tf is missing.",
    recommendation: "Disable Terraform workflow until infrastructure files exist."
  });
}

if (unclassified.length > 0) {
  constraints.push({
    title: "Unclassified top-level modules",
    severity: "medium",
    evidence: `Unclassified folders: ${unclassified.join(", ")}`,
    recommendation: "Move unclassified folders into active core, modules, research, or docs spine."
  });
}

if (topFolders.length > 18) {
  constraints.push({
    title: "Repository fragmentation",
    severity: "high",
    evidence: `${topFolders.length} top-level folders detected.`,
    recommendation: "Create active/plugin/research spine map and stop expanding sideways."
  });
}

const actions = constraints.map((c, i) => ({
  title: c.recommendation,
  priority_score: c.severity === "critical" ? 100 : 80 - i * 5,
  confidence: 0.9,
  effort: c.severity === "critical" ? 1 : 2,
  expected_impact: c.severity === "critical" ? "Restore CI reliability" : "Reduce platform complexity"
}));

const mission = {
  title: "CYVX CI Reliability + Self-Scan Sprint",
  status: "ready",
  tasks: [
    "Upgrade GitHub Actions Node version to 22",
    "Disable Terraform workflow until main.tf exists",
    "Expose scan-self as CLI command",
    "Use self-scan output as the first operational proof loop"
  ],
  success_metric: "node ./cli/cyvx.js scan-self returns top constraint and CI passes"
};

const result = {
  system: "CYVX Self Scan",
  health: constraints.some(c => c.severity === "critical") ? "at-risk" : "stable",
  top_constraint: constraints[0] || null,
  observations,
  constraints,
  next_best_actions: actions,
  mission,
  trust_score: 0.92,
  repo_spine: {
    top_folder_count: topFolders.length,
    fragmentation_score: fragmentationScore,
    classified,
    unclassified,
    target_top_folder_count: 12
  }
};

console.log(JSON.stringify(result, null, 2));
