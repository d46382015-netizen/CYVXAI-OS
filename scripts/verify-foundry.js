"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const required = [
  "core/agent-foundry/foundry.js",
  "core/agent-foundry/index.js",
  "ops/sqlite/004_grant_gated_agent_foundry.sql",
  "test/agent-foundry-grants.test.js",
  "docs/GRANT_GATED_AGENT_FOUNDRY.md",
  "api/governance.js",
  "ui/governance.html"
];
for (const relative of required) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: "MISSING_ARTIFACT", file: relative })}\n`);
    process.exit(1);
  }
}
for (const relative of ["core/agent-foundry/foundry.js", "api/governance.js"]) {
  const checked = spawnSync(process.execPath, ["--check", path.join(root, relative)], { stdio: "inherit" });
  if (checked.status !== 0) process.exit(checked.status || 1);
}
const tests = spawnSync(process.execPath, ["--test", path.join(root, "test/agent-foundry-grants.test.js")], { stdio: "inherit" });
if (tests.status !== 0) process.exit(tests.status || 1);
process.stdout.write(`${JSON.stringify({
  ok: true,
  capability: "cyvx-grant-gated-agent-foundry",
  artifacts: required.length,
  sensitive_actions: ["create_agent", "deploy_staging", "deploy_production", "spend_budget"],
  invariants: ["exact_capability", "exact_grantee", "signed_grant", "single_use", "artifact_identity", "budget_ceiling", "durable_receipt"]
})}\n`);
