"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const required = [
  "core/governance/kernel.js",
  "core/governance/index.js",
  "api/governance.js",
  "ui/governance.html",
  "ops/sqlite/003_autonomous_governance.sql",
  "test/governance-kernel.test.js",
  "run-governance.sh",
  "docs/AUTONOMOUS_GOVERNANCE_KERNEL.md"
];

for (const relative of required) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: "MISSING_ARTIFACT", file: relative })}\n`);
    process.exit(1);
  }
}
for (const relative of ["core/governance/kernel.js", "api/governance.js"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, relative)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
const tests = spawnSync(process.execPath, ["--test", path.join(root, "test/governance-kernel.test.js")], { stdio: "inherit" });
if (tests.status !== 0) process.exit(tests.status || 1);
process.stdout.write(`${JSON.stringify({
  ok: true,
  capability: "cyvx-autonomous-governance-kernel",
  artifacts: required.length,
  controls: ["global_stop", "spending_freeze", "agent_creation_disable", "external_action_disable"],
  flow: ["worker", "supervisor", "boss", "policy_gate", "capability_grant", "evidence_ledger"]
})}\n`);
