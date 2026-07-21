#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const proofDirectory = path.resolve(process.env.CYVX_COMPANY_RUNTIME_PROOF_DIR || path.join(process.cwd(), "artifacts", "autonomous-company-runtime"));
const proofPath = path.join(proofDirectory, "verification.json");

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8", env: process.env, maxBuffer: 16 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`node ${args.join(" ")} exited with status ${result.status || 1}`);
    error.code = "VERIFY_COMMAND_FAILED";
    error.command = [process.execPath, ...args];
    error.status = result.status || 1;
    error.stdout = result.stdout || "";
    error.stderr = result.stderr || "";
    throw error;
  }
}

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function writeProof(proof) {
  fs.mkdirSync(proofDirectory, { recursive: true });
  fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
}

function main() {
  const codeFiles = [
    "services/company-runtime/index.js",
    "services/company-runtime/server.js",
    "services/company-runtime/ui.js",
    "services/company-runtime/bootstrap.js",
    "services/company-runtime/gateway.js",
    "services/company-runtime/scheduler.js",
    "api/public-company.js",
    "api/runtime-v7.js",
    "scripts/start-autonomous-company-runtime.js",
    "test/autonomous-company-runtime-v2.test.js",
    "test/company-experience.test.js",
    "test/canonical-company-gateway.test.js",
    "test/first-company-activation.test.js",
  ];
  const proofFiles = [...codeFiles, "docs/CYVX_CINEMATIC_COMPANY_EXPERIENCE.md"];
  for (const file of codeFiles) run(["--check", file]);
  run(["--test", "test/autonomous-company-runtime-v2.test.js", "test/company-experience.test.js", "test/canonical-company-gateway.test.js", "test/first-company-activation.test.js"]);
  writeProof({
    schema_version: 4,
    ok: true,
    generated_at: new Date().toISOString(),
    capability: "cyvx-autonomous-company-runtime-v2-canonical-cinematic-production-edge",
    agents: 9,
    model_providers: ["rules", "anthropic", "claude-cli"],
    public_routes: ["/", "/api/v1/company-runtime/public/status", "/api/v1/company-runtime/public/leads"],
    control_routes: ["/control", "/control-room", "/api/v1/company-runtime/companies"],
    preserved_routes: ["/missions", "/spark", "/field-manual", "/api/public/status", "/healthz", "/readyz"],
    durable_primitives: ["teams", "agents", "tasks", "leases", "memory", "metrics", "learnings", "integrations", "deliveries", "events", "public_lead_intake", "canonical_gateway", "autonomous_scheduler", "resumable_first_company_activation", "measured_outcome_receipt"],
    verified_files: proofFiles.map((file) => ({ path: file, sha256: digest(file), bytes: fs.statSync(file).size })),
    truth_boundary: "Verification proves local canonical-runtime composition, resumable first-company creation and approval, nine-agent run-to-idle execution, a persisted measured outcome, queued next-cycle learning, public lead intake, sanitized public proof, authenticated controls, preserved routes, security controls, signed webhook delivery, and tests. It does not claim a live customer, payment, collected revenue, or externally reachable deployment until the public activation workflow records that evidence.",
  });
  process.stdout.write(`${JSON.stringify({ ok: true, event: "company_runtime.verified", proof: proofPath })}\n`);
}

try {
  main();
} catch (error) {
  writeProof({
    schema_version: 4,
    ok: false,
    generated_at: new Date().toISOString(),
    capability: "cyvx-autonomous-company-runtime-v2-canonical-cinematic-production-edge",
    error: {
      code: error.code || "VERIFICATION_FAILED",
      message: error.message,
      status: error.status || 1,
      command: error.command || null,
      stdout_tail: String(error.stdout || "").slice(-12000),
      stderr_tail: String(error.stderr || "").slice(-12000),
    },
    truth_boundary: "This proof records the exact failed verification command and output tail. No production-readiness claim is made while ok is false.",
  });
  process.stderr.write(`${JSON.stringify({ ok: false, event: "company_runtime.verification_failed", proof: proofPath, error: error.stack || error.message })}\n`);
  process.exit(error.status || 1);
}
