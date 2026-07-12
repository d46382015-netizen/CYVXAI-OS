#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const required = [
  "api/runtime-v7.js",
  "core/ventures/production-audit-venture.js",
  "core/integrations/supabase-persistence-adapter.js",
  "scripts/run-first-governed-venture.js",
  "scripts/activate-cyvx-production.js",
  "scripts/verify-production-activation.js",
  "test/production-activation-first-venture.test.js",
  ".github/workflows/cyvx-production-activation.yml"
];

function fail(error, details = {}) {
  process.stderr.write(`${JSON.stringify({ ok: false, error, ...details })}\n`);
  process.exit(1);
}

for (const relative of required) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) fail("MISSING_ACTIVATION_ARTIFACT", { file: relative });
  const content = fs.readFileSync(file, "utf8");
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(content) || /sbp_[A-Za-z0-9_-]{10,}/.test(content)) {
    fail("CREDENTIAL_COMMITTED", { file: relative });
  }
  if (/Savagesquad/i.test(content)) fail("EXPOSED_PASSWORD_COMMITTED", { file: relative });
  if (relative.endsWith(".js")) {
    const syntax = spawnSync(process.execPath, ["--check", file], { cwd: root, stdio: "inherit" });
    if (syntax.status !== 0) process.exit(syntax.status || 1);
  }
}

const tests = spawnSync(process.execPath, ["--test", path.join(root, "test", "production-activation-first-venture.test.js")], {
  cwd: root,
  stdio: "inherit"
});
if (tests.status !== 0) process.exit(tests.status || 1);

const venture = fs.readFileSync(path.join(root, "scripts", "run-first-governed-venture.js"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "cyvx-production-activation.yml"), "utf8");
const runtime = fs.readFileSync(path.join(root, "api", "runtime-v7.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const checks = {
  child_creation_grant: /requestedAction:\s*"create_agent"/.test(venture),
  staging_grant: /requestedAction:\s*"deploy_staging"/.test(venture),
  supervisor_review: /review_type:\s*"supervisor"/.test(venture),
  boss_review: /review_type:\s*"boss"/.test(venture),
  production_gate: /evaluateProductionGate/.test(venture),
  protected_environment: /environment:\s*production/.test(workflow),
  schema_deployment: /CYVX_ACTIVATION_APPLY_SCHEMA:\s*'true'/.test(workflow),
  evidence_artifact: /production-activation-latest\.json/.test(workflow),
  canonical_unified_start: packageJson.scripts.start === "node ./api/runtime-v7.js",
  mission_worker_created: /publicRuntime\.missions\.createWorker/.test(runtime),
  mission_worker_started: /missionWorker\.start\(\)/.test(runtime),
  mission_worker_stopped: /missionWorker\.stop\(\)/.test(runtime)
};
if (!Object.values(checks).every(Boolean)) fail("ACTIVATION_CONTRACT_INCOMPLETE", { checks });

process.stdout.write(`${JSON.stringify({
  ok: true,
  capability: "cyvx-production-activation",
  files: required.length,
  checks,
  first_venture: "production-audit-v1",
  autonomous_stage: "staging_validation",
  production_requires_external_demand_evidence: true,
  unified_runtime_worker: true
})}\n`);
