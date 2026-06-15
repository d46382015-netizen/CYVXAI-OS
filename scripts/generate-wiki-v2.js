#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const outputDir = path.resolve(process.argv[2] || path.join(process.cwd(), "dist", "wiki"));
const repoUrl = "https://github.com/d46382015-netizen/CYVXAI-OS";
const navigation = "[Home](Home) · [Architecture](Architecture) · [Installation](Installation) · [Operator Guide](Operator-Guide) · [API Reference](API-Reference) · [CLI Reference](CLI-Reference)";

function code(language, lines) {
  return ["~~~" + language, ...lines, "~~~"].join("\n");
}

function renderPage(spec) {
  const lines = ["# " + spec.title, "", navigation, "", spec.intro, ""];
  for (const section of spec.sections || []) {
    lines.push("## " + section.title, "");
    for (const paragraph of section.paragraphs || []) lines.push(paragraph, "");
    for (const bullet of section.bullets || []) lines.push("- " + bullet);
    if ((section.bullets || []).length) lines.push("");
    if (section.code) lines.push(code(section.code.language || "text", section.code.lines || []), "");
  }
  lines.push("## Related Documentation", "");
  for (const link of spec.related || ["Home", "Architecture", "Installation"]) {
    lines.push("- [" + link.replaceAll("-", " ") + "](" + link + ")");
  }
  return lines.join("\n").trim() + "\n";
}

const commonPrinciples = [
  "Reality is the source of truth.",
  "Every mission has a measurable objective.",
  "Every important action has an accountable owner.",
  "High-impact execution requires authorization.",
  "Outcomes are compared with predictions.",
  "Failures become reusable learning.",
  "Claims require evidence.",
  "Autonomy remains observable, bounded, interruptible, and measurable."
];

const specs = [
  {
    file: "Home.md",
    title: "CYVXAI-OS",
    intro: "**Autonomous Infrastructure Intelligence for observing reality, coordinating execution, proving outcomes, and improving continuously.**\n\nCreated by **Dakota Lee Jonsgaard**  \n© 2026 Dakota Lee Jonsgaard. All rights reserved.",
    sections: [
      { title: "What CYVX Is", paragraphs: ["CYVXAI-OS is a production-oriented intelligence and coordination platform that turns real-world signals into measurable action.", "> **Observe → Model → Prioritize → Coordinate → Execute → Measure → Learn → Improve**"] },
      { title: "Core Platform", bullets: ["Reality Graph for entities, relationships, events, state, health, constraints, and impact.", "Agent OS for lifecycle, memory, planning, delegation, confidence, and mission execution.", "Mission Control for planning, simulation, assignment, execution, monitoring, and proof.", "Coordination Platform for owners, resources, approvals, queues, and next-best actions.", "Intelligence Platform for patterns, recommendations, priorities, forecasts, and risk.", "Reality Engine for predictions, outcomes, calibration, proof, and learning.", "Spark Runtime for controlled autonomous execution and evidence capture."] },
      { title: "Quick Start", code: { language: "bash", lines: ["git clone " + repoUrl + ".git", "cd CYVXAI-OS", "bash ./install.sh", "bash ./start.sh"] }, paragraphs: ["Open http://127.0.0.1:3000/ and run npm run verify from a second terminal."] },
      { title: "Current Mission", paragraphs: ["> **Understand reality, identify constraints, coordinate intelligence and resources, execute controlled interventions, prove outcomes, and improve over time.**"] }
    ],
    related: ["Architecture", "Installation", "Operator-Guide", "API-Reference", "CLI-Reference", "Spark-Runtime", "Product-Roadmap"]
  },
  {
    file: "Architecture.md",
    title: "Architecture",
    intro: "CYVXAI-OS is organized as a closed operating system for reality, intelligence, coordination, execution, proof, and learning.",
    sections: [
      { title: "Layered Model", code: { language: "text", lines: ["Users and Operators", "        ↓", "Dashboard · CLI · API · WebSocket", "        ↓", "Mission Control · Executive Intelligence", "        ↓", "Patterns · Recommendations · Priorities", "        ↓", "Humans · Agents · Resources · Approvals · Queue", "        ↓", "Spark Runtime · Commands · Workloads · Actions", "        ↓", "Outcomes · Metrics · Events · Proof Ledger", "        ↓", "Learning · Calibration · Evolution"] } },
      { title: "Runtime Areas", code: { language: "text", lines: ["api/       HTTP API, WebSocket, authorization, rate limiting, and UI serving", "cli/       Command-line operations and local kernel access", "core/      Controller, platform kernel, intelligence, agents, and proof", "spark/     Controlled autonomous runtime", "ui/        Browser interface", "scripts/   Build, verification, self-scan, strategy, and automation", "test/      Automated platform, API, CLI, runtime, and security tests"] } },
      { title: "Architectural Invariants", bullets: commonPrinciples }
    ],
    related: ["Home", "Kernel-Specification", "Coordination-Platform", "Intelligence-Platform", "Reality-Engine"]
  },
  {
    file: "Installation.md",
    title: "Installation",
    intro: "Install and verify CYVXAI-OS on Linux, macOS, Android UserLAnd, Termux, or Windows through WSL.",
    sections: [
      { title: "Requirements", bullets: ["Git", "Bash", "Node.js", "npm", "A writable home directory", "An available TCP port"] },
      { title: "Install and Start", code: { language: "bash", lines: ["git clone " + repoUrl + ".git && \\", "cd CYVXAI-OS && \\", "bash ./install.sh && \\", "bash ./start.sh"] }, paragraphs: ["The default dashboard is http://127.0.0.1:3000/."] },
      { title: "Verify", code: { language: "bash", lines: ["cd ~/CYVXAI-OS", "npm run verify", "curl -fsS http://127.0.0.1:3000/health"] } },
      { title: "Android UserLAnd", code: { language: "bash", lines: ["apt update && apt install -y git curl bash nodejs npm", "cd ~", "git clone " + repoUrl + ".git", "cd CYVXAI-OS", "bash ./install.sh", "bash ./start.sh"] } },
      { title: "Android Termux", code: { language: "bash", lines: ["pkg update -y && pkg install -y git nodejs-lts curl", "cd ~", "git clone " + repoUrl + ".git", "cd CYVXAI-OS", "bash ./install.sh", "bash ./start.sh"] } },
      { title: "Custom Port", code: { language: "bash", lines: ["CYVX_PORT=8787 bash ./start.sh"] } }
    ],
    related: ["Home", "Operator-Guide", "Testing-and-Verification", "Troubleshooting", "Deployment"]
  },
  {
    file: "Operator-Guide.md",
    title: "Operator Guide",
    intro: "The operator converts real conditions into governed, measurable execution and ensures every important action produces an outcome and proof.",
    sections: [
      { title: "Standard Cycle", code: { language: "text", lines: ["1. Verify health", "2. Inspect platform state", "3. Observe reality", "4. Review intelligence", "5. Select the highest-priority constraint", "6. Confirm mission, owner, resources, and approval", "7. Execute through an authorized runtime", "8. Monitor failures and retries", "9. Record the outcome", "10. Compare expected and actual results", "11. Preserve proof", "12. Store learning and recalculate the next-best action"] } },
      { title: "Start and Inspect", code: { language: "bash", lines: ["cd ~/CYVXAI-OS", "npm run verify", "bash ./start.sh", "curl -fsS http://127.0.0.1:3000/health", "curl -fsS http://127.0.0.1:3000/api/v1/platform", "curl -fsS http://127.0.0.1:3000/api/v1/priorities", "curl -fsS http://127.0.0.1:3000/api/v1/next-best-action", "curl -fsS http://127.0.0.1:3000/api/v1/queue"] } },
      { title: "Approval Rule", paragraphs: ["Require explicit approval before actions that can affect production, users, protected data, permissions, money, publishing, security controls, or irreversible state.", "Approval authorizes execution. Completion still requires a measured outcome and evidence."] },
      { title: "Safe Shutdown", paragraphs: ["Press CTRL+C in the attached runtime terminal, then verify that the health endpoint no longer responds."] }
    ],
    related: ["Home", "Architecture", "Security-and-Governance", "Spark-Runtime", "Reality-Engine"]
  },
  {
    file: "API-Reference.md",
    title: "API Reference",
    intro: "The default API base URL is http://127.0.0.1:3000. Responses are JSON and include CYVX attribution, version, and timestamp metadata.",
    sections: [
      { title: "Authentication and Limits", paragraphs: ["When CYVX_API_KEY is set, send either x-api-key or Authorization: Bearer with the matching value.", "The default rate limit is 120 requests per minute. JSON request bodies are limited to 1 MB."] },
      { title: "Health and Platform", code: { language: "text", lines: ["GET /health", "GET /healthz", "GET /status", "GET /metrics", "GET /api/v1/platform", "GET /api/v1/overview", "GET /api/v1/dashboard", "GET /api/v1/status-model", "GET /api/v1/metrics/history"] } },
      { title: "Reality and Kernel", code: { language: "text", lines: ["GET/POST /api/v1/observations", "GET      /api/v1/reality", "GET/POST /api/v1/criteria", "GET/POST /api/v1/reality-objects", "GET/POST /api/v1/significance", "GET/POST /api/v1/interventions", "GET/POST /api/v1/outcomes", "GET      /api/v1/evolution", "GET      /api/v1/cir", "GET      /api/v1/kernel", "GET      /api/v1/reality-engine"] } },
      { title: "Graph, Agents, and Missions", code: { language: "text", lines: ["GET/POST /api/v1/entities", "GET/POST /api/v1/relationships", "GET      /api/v1/graph", "GET/POST /api/v1/agents", "GET/POST /api/v1/missions", "GET/POST /api/v1/simulations", "GET/POST /api/v1/reports", "GET/POST /api/v1/commands", "GET/POST /api/v1/events"] } },
      { title: "Coordination and Intelligence", code: { language: "text", lines: ["GET/POST /api/v1/coordination", "GET      /api/v1/next-best-action", "GET      /api/v1/humans", "GET      /api/v1/resources", "GET      /api/v1/assignments", "GET      /api/v1/approvals", "GET      /api/v1/queue", "GET/POST /api/v1/patterns", "GET/POST /api/v1/recommendations", "GET      /api/v1/priorities", "GET      /api/v1/intelligence", "GET      /api/v1/executive"] } },
      { title: "Proof and Self-Improvement", code: { language: "text", lines: ["GET /api/v1/repository-health", "GET /api/v1/proof", "GET /api/v1/proof-ledger", "GET /api/v1/tribunal", "GET /api/v1/github/repository", "GET /api/v1/github/health", "GET /api/v1/github/proof", "GET /api/v1/self-scan", "GET /api/v1/self-scan-mission"] } },
      { title: "WebSocket", paragraphs: ["Connect to /ws. When API authentication is enabled, include the same API key during the WebSocket upgrade request."] }
    ],
    related: ["Home", "CLI-Reference", "Security-and-Governance", "Testing-and-Verification"]
  },
  {
    file: "CLI-Reference.md",
    title: "CLI Reference",
    intro: "Run the CYVX CLI through npm run cli -- or node ./cli/cyvx.js.",
    sections: [
      { title: "Help", code: { language: "bash", lines: ["npm run cli -- help", "node ./cli/cyvx.js help"] } },
      { title: "Inspection", code: { language: "bash", lines: ["node ./cli/cyvx.js status", "node ./cli/cyvx.js health", "node ./cli/cyvx.js graph", "node ./cli/cyvx.js agents", "node ./cli/cyvx.js missions", "node ./cli/cyvx.js events", "node ./cli/cyvx.js observations", "node ./cli/cyvx.js reality-engine"] } },
      { title: "Kernel and Intelligence", code: { language: "bash", lines: ["node ./cli/cyvx.js criteria", "node ./cli/cyvx.js significance", "node ./cli/cyvx.js interventions", "node ./cli/cyvx.js outcomes", "node ./cli/cyvx.js evolution", "node ./cli/cyvx.js cir", "node ./cli/cyvx.js kernel", "node ./cli/cyvx.js patterns", "node ./cli/cyvx.js recommendations", "node ./cli/cyvx.js priorities", "node ./cli/cyvx.js intelligence"] } },
      { title: "Coordination", code: { language: "bash", lines: ["node ./cli/cyvx.js humans", "node ./cli/cyvx.js resources", "node ./cli/cyvx.js approvals", "node ./cli/cyvx.js queue", "node ./cli/cyvx.js nba", "node ./cli/cyvx.js coordination"] } },
      { title: "Proof and Self-Scan", code: { language: "bash", lines: ["node ./cli/cyvx.js repository-health owner=d46382015-netizen repo=CYVXAI-OS", "node ./cli/cyvx.js proof owner=d46382015-netizen repo=CYVXAI-OS", "node ./cli/cyvx.js scan-self", "node ./cli/cyvx.js self-scan-mission"] } }
    ],
    related: ["Home", "API-Reference", "Operator-Guide", "Kernel-Specification"]
  },
  {
    file: "Spark-Runtime.md",
    title: "Spark Runtime",
    intro: "Spark is the controlled autonomous execution layer. It preserves owner control over approval, interruption, configuration, evidence, and export.",
    sections: [
      { title: "Start", code: { language: "bash", lines: ["cd ~/CYVXAI-OS", "npm run spark:run"] }, paragraphs: ["Open http://127.0.0.1:3100/."] },
      { title: "Verify", code: { language: "bash", lines: ["npm run spark:test", "npm run verify"] } },
      { title: "Operating Rules", bullets: ["Validated", "Authorized", "Assigned", "Observable", "Bounded", "Measurable", "Interruptible", "Supported by evidence"] },
      { title: "State", paragraphs: ["Spark stores portable runtime state under .cyvx/. Back up this directory before destructive maintenance or migration."] }
    ],
    related: ["Home", "Operator-Guide", "Security-and-Governance", "Testing-and-Verification"]
  },
  {
    file: "Kernel-Specification.md",
    title: "Kernel Specification",
    intro: "CYVX Kernel v1 is the stable foundation beneath coordination, intelligence, execution, proof, learning, and evolution.",
    sections: [
      { title: "Six Services", bullets: ["Constitution defines rules, permissions, limits, and evaluation criteria.", "Reality stores verified objects, events, relationships, and state.", "Significance determines what matters and why.", "Intervention defines controlled actions intended to change reality.", "Learning compares expectations with outcomes and stores lessons.", "Evolution recommends improvements to policies, workflows, agents, and behavior."] },
      { title: "Canonical Records", bullets: ["Constitutional Criterion", "Reality Object", "Significance Record", "Intervention", "Outcome", "Evolution Recommendation", "CIR Metric"] },
      { title: "Kernel API", code: { language: "text", lines: ["GET/POST /api/v1/criteria", "GET/POST /api/v1/reality-objects", "GET/POST /api/v1/significance", "GET/POST /api/v1/interventions", "GET/POST /api/v1/outcomes", "GET      /api/v1/evolution", "GET      /api/v1/cir", "GET      /api/v1/kernel"] } },
      { title: "Invariants", bullets: commonPrinciples }
    ],
    related: ["Home", "Architecture", "Coordination-Platform", "Reality-Engine"]
  },
  {
    file: "Coordination-Platform.md",
    title: "Coordination Platform",
    intro: "Coordination decides who acts, when, with what resources, under which approval, and in what order.",
    sections: [
      { title: "Records", bullets: ["Humans", "Agents", "Resources", "Assignments", "Approvals", "Queue items", "Priorities", "Next-best actions"] },
      { title: "Flow", code: { language: "text", lines: ["Significance → Intervention → Mission", "Mission → Assignment + Resources + Approval", "Approval → Queue → Execution → Outcome", "Outcome → Learning + CIR → Next-Best Action"] } },
      { title: "Interfaces", code: { language: "text", lines: ["GET/POST /api/v1/coordination", "GET /api/v1/next-best-action", "GET /api/v1/humans", "GET /api/v1/resources", "GET /api/v1/assignments", "GET /api/v1/approvals", "GET /api/v1/queue"] } },
      { title: "Readiness Rule", paragraphs: ["Do not queue high-impact execution until the objective, owner, resources, approval state, success metric, failure behavior, and evidence destination are known."] }
    ],
    related: ["Home", "Kernel-Specification", "Operator-Guide", "Security-and-Governance"]
  },
  {
    file: "Intelligence-Platform.md",
    title: "Intelligence Platform",
    intro: "The intelligence layer converts operating history, outcomes, trust, proof, and CIR data into explainable decision support.",
    sections: [
      { title: "Outputs", bullets: ["Patterns", "Recommendations", "Priorities", "Forecasts", "Risks", "Opportunities", "Executive summaries", "Next-best actions"] },
      { title: "Interfaces", code: { language: "text", lines: ["GET/POST /api/v1/patterns", "GET/POST /api/v1/recommendations", "GET /api/v1/priorities", "GET /api/v1/intelligence", "GET /api/v1/executive", "GET /api/v1/next-best-action", "GET /api/v1/decision-intelligence", "GET /api/v1/daily-decision-brief", "GET /api/v1/truth-model"] } },
      { title: "Quality Standard", bullets: ["Explain what was detected.", "Explain why it matters.", "Identify supporting evidence.", "Recommend a bounded action.", "Define the expected outcome.", "Define how success will be measured.", "Expose remaining risk and uncertainty."] },
      { title: "Authority", paragraphs: ["Intelligence is advisory until an authorized mission, owner, and execution path exist."] }
    ],
    related: ["Home", "Coordination-Platform", "Reality-Engine", "Operator-Guide"]
  },
  {
    file: "Reality-Engine.md",
    title: "Reality Engine",
    intro: "The Reality Engine connects observation, prediction, intervention, outcome, error measurement, proof, learning, and evolution.",
    sections: [
      { title: "Closed Loop", code: { language: "text", lines: ["Observation → Reality Model → Prediction → Intervention → Outcome", "     ↑                                                  ↓", "Evolution ← Learning ← Error and Calibration Measurement"] } },
      { title: "Measurements", bullets: ["Expected outcome", "Actual outcome", "Baseline", "Prediction error", "Calibration error", "Confidence accuracy", "Outcome quality", "Side effects", "Resource cost", "Reusable lessons"] },
      { title: "Interfaces", code: { language: "text", lines: ["GET /api/v1/reality-engine", "GET /api/v1/observations", "GET /api/v1/reality", "GET /api/v1/outcomes", "GET /api/v1/proof-ledger"] } },
      { title: "Completion Rule", paragraphs: ["A mission is complete only after its intended outcome is measured and supported by evidence. A successful command is execution evidence, not outcome proof."] }
    ],
    related: ["Home", "Kernel-Specification", "Intelligence-Platform", "Testing-and-Verification"]
  },
  {
    file: "Security-and-Governance.md",
    title: "Security and Governance",
    intro: "CYVX autonomy must remain observable, authorized, bounded, interruptible, measurable, and accountable.",
    sections: [
      { title: "Built-In Controls", bullets: ["Optional API key through CYVX_API_KEY", "x-api-key and Bearer token support", "Per-client rate limiting through CYVX_RATE_LIMIT", "1 MB JSON body limit", "WebSocket authorization", "Structured JSON responses"] },
      { title: "Production Requirements", bullets: ["TLS reverse proxy", "Dedicated runtime account", "Restricted network access", "Strong secret management", "Separated development and production state", "Audit evidence retention", "Health and rate-limit monitoring", "Backups and tested recovery"] },
      { title: "Approval Tiers", paragraphs: ["Require approval for production changes, destructive writes, protected data access, permission changes, financial activity, public publishing, external user impact, and irreversible operations."] },
      { title: "Incident Rule", paragraphs: ["Contain first, preserve evidence second, restore a safe state third, verify health fourth, and only then resume execution."] }
    ],
    related: ["Home", "Operator-Guide", "Deployment", "Troubleshooting"]
  },
  {
    file: "Testing-and-Verification.md",
    title: "Testing and Verification",
    intro: "Verification is the release gate for CYVX code, runtime behavior, security controls, and documentation automation.",
    sections: [
      { title: "Standard Verification", code: { language: "bash", lines: ["cd ~/CYVXAI-OS", "npm run verify"] }, paragraphs: ["The verify command runs the Node test suite and project build."] },
      { title: "Individual Commands", code: { language: "bash", lines: ["npm test", "npm run build", "npm run spark:test", "npm run wiki:generate"] } },
      { title: "Live Verification", code: { language: "bash", lines: ["curl -fsS http://127.0.0.1:3000/health", "curl -fsS http://127.0.0.1:3000/status", "curl -fsS http://127.0.0.1:3000/api/v1/platform", "curl -fsS http://127.0.0.1:3000/api/v1/reality-engine"] } },
      { title: "Release Gate", paragraphs: ["Do not deploy when tests fail, the build fails, health checks fail, required state is not writable, approval controls are unavailable, or rollback is untested."] }
    ],
    related: ["Home", "Installation", "Deployment", "Troubleshooting"]
  },
  {
    file: "Deployment.md",
    title: "Deployment",
    intro: "CYVX runs as a Node.js HTTP service that serves the UI and upgrades authorized WebSocket connections.",
    sections: [
      { title: "Runtime", code: { language: "bash", lines: ["CYVX_HOST=0.0.0.0 CYVX_PORT=3000 bash ./start.sh"] } },
      { title: "Environment", code: { language: "text", lines: ["CYVX_HOST", "CYVX_PORT", "CYVX_API_KEY", "CYVX_RATE_LIMIT", "CYVX_DB", "CYVX_PLATFORM_STATE", "CYVX_PROOF_LEDGER_PATH"] } },
      { title: "Production Checklist", bullets: ["Dedicated runtime user", "Pinned Node.js version", "Passing tests and build", "Durable writable state", "TLS", "API authentication", "Firewall restrictions", "Health monitoring", "Log retention", "Backup and restore procedure", "Rollback plan"] },
      { title: "Preflight", code: { language: "bash", lines: ["cd ~/CYVXAI-OS", "bash ./install.sh", "npm run verify"] } },
      { title: "Rollback", paragraphs: ["Preserve the previous release and compatible runtime backup. Stop the failed release, restore the prior code and state, start it, and verify health and critical routes before reopening traffic."] }
    ],
    related: ["Home", "Installation", "Security-and-Governance", "Testing-and-Verification"]
  },
  {
    file: "Troubleshooting.md",
    title: "Troubleshooting",
    intro: "Preserve the first failure output, repair the smallest verified constraint, and rerun the relevant verification path.",
    sections: [
      { title: "Environment", code: { language: "bash", lines: ["command -v node", "node --version", "npm --version", "git --version"] } },
      { title: "Dependency Repair", code: { language: "bash", lines: ["cd ~/CYVXAI-OS", "rm -rf node_modules", "npm cache verify", "bash ./install.sh", "npm run verify"] } },
      { title: "Port Conflict", code: { language: "bash", lines: ["ss -ltnp 2>/dev/null | grep ':3000'", "CYVX_PORT=8787 bash ./start.sh"] } },
      { title: "Dashboard or API Failure", code: { language: "bash", lines: ["ps aux | grep '[n]ode'", "curl -v http://127.0.0.1:3000/health", "curl -v http://127.0.0.1:3000/status"] } },
      { title: "HTTP Errors", bullets: ["401 means the configured API key is missing or incorrect.", "429 means the client exceeded the configured per-minute rate limit.", "Connection refused means the service is stopped, crashed, or listening on another host or port."] }
    ],
    related: ["Home", "Installation", "Testing-and-Verification", "Deployment"]
  },
  {
    file: "Contribution-Standards.md",
    title: "Contribution Standards",
    intro: "Every contribution must improve a real connected capability. Avoid disconnected demos, duplicate pathways, placeholder behavior, and undocumented state changes.",
    sections: [
      { title: "Required Quality", bullets: ["Connected implementation", "Input validation", "Failure handling", "Logging or evidence", "Automated tests", "Documentation", "Compatibility assessment", "Run and verification steps"] },
      { title: "Local Workflow", code: { language: "bash", lines: ["git checkout -b feature/descriptive-name", "npm run verify", "git status --short", "git add .", "git commit -m 'Describe the production capability'"] } },
      { title: "Pull Request Standard", paragraphs: ["State the constraint, architecture decision, files changed, verification performed, security impact, migration impact, rollback path, and measured outcome."] },
      { title: "Review Priorities", bullets: ["Correctness", "Security and authorization", "Persistence and data integrity", "Runtime behavior", "Tests", "Observability", "Documentation", "Maintainability"] }
    ],
    related: ["Home", "Architecture", "Testing-and-Verification", "Product-Roadmap"]
  },
  {
    file: "Product-Roadmap.md",
    title: "Product Roadmap",
    intro: "The roadmap follows the CYVX loop: verify reality, identify constraints, execute measurable improvements, and preserve proof.",
    sections: [
      { title: "Now — Reliable Single-Node Platform", bullets: ["Stabilize API and CLI contracts", "Strengthen validation and error schemas", "Expand persistence and recovery tests", "Unify health, status, metrics, and proof", "Document production surfaces", "Preserve mobile and UserLAnd compatibility"] },
      { title: "Next — Governed Autonomous Execution", bullets: ["Policy-based authorization", "Durable approval workflows", "Idempotent execution records", "Runtime checkpoints and recovery", "Sandboxed tools", "Signed evidence records", "Workflow versioning", "Agent conflict resolution"] },
      { title: "Scale — Multi-Tenant Coordination", bullets: ["Durable database adapters", "Tenant isolation", "Event-driven workers", "Distributed queues", "Horizontal scaling", "Tracing", "Usage and economic metering", "Exportable digital twins"] },
      { title: "Growth — Platform and Marketplace", bullets: ["Reusable mission templates", "Verified agent capabilities", "Operator and partner workspaces", "Outcome-backed assets", "Licensing and enterprise controls", "Measurable customer ROI"] },
      { title: "Roadmap Gate", paragraphs: ["An item advances only when its constraint is verified, success metric is defined, owner is assigned, implementation is connected, tests pass, and proof demonstrates improvement over baseline."] }
    ],
    related: ["Home", "Architecture", "Contribution-Standards", "Testing-and-Verification"]
  }
];

const pages = Object.fromEntries(specs.map((spec) => [spec.file, renderPage(spec)]));
pages["_Sidebar.md"] = [
  "## CYVXAI-OS",
  "",
  ...specs.map((spec) => "- [" + spec.title + "](" + spec.file.replace(/\.md$/, "") + ")")
].join("\n") + "\n";
pages["_Footer.md"] = "**CYVXAI-OS** · Created by Dakota Lee Jonsgaard · © 2026 · [Repository](" + repoUrl + ") · [Issues](" + repoUrl + "/issues)\n";

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
for (const [fileName, content] of Object.entries(pages)) {
  fs.writeFileSync(path.join(outputDir, fileName), content, "utf8");
}

const generatedFiles = Object.keys(pages).sort();
if (!generatedFiles.includes("Home.md") || !generatedFiles.includes("_Sidebar.md") || generatedFiles.length < 19) {
  throw new Error("Wiki generation failed completeness validation");
}

console.log(JSON.stringify({ generated: generatedFiles.length, output: outputDir, files: generatedFiles }, null, 2));
