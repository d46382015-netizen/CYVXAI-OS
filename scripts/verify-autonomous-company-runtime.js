#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function main() {
  const codeFiles = [
    "services/company-runtime/index.js",
    "services/company-runtime/server.js",
    "services/company-runtime/ui.js",
    "scripts/start-autonomous-company-runtime.js",
    "test/autonomous-company-runtime-v2.test.js",
    "test/company-experience.test.js",
  ];
  const proofFiles = [...codeFiles, "docs/CYVX_CINEMATIC_COMPANY_EXPERIENCE.md"];
  for (const file of codeFiles) run(["--check", file]);
  run(["--test", "test/autonomous-company-runtime-v2.test.js", "test/company-experience.test.js"]);
  const proofDirectory = path.resolve(process.env.CYVX_COMPANY_RUNTIME_PROOF_DIR || path.join(process.cwd(), "artifacts", "autonomous-company-runtime"));
  fs.mkdirSync(proofDirectory, { recursive: true });
  const proof = {
    schema_version: 2,
    ok: true,
    generated_at: new Date().toISOString(),
    capability: "cyvx-autonomous-company-runtime-v2-cinematic-production-edge",
    agents: 9,
    model_providers: ["rules", "anthropic", "claude-cli"],
    public_routes: ["/", "/api/v1/company-runtime/public/status", "/api/v1/company-runtime/public/leads"],
    control_routes: ["/control-room", "/api/v1/company-runtime/companies"],
    durable_primitives: ["teams", "agents", "tasks", "leases", "memory", "metrics", "learnings", "integrations", "deliveries", "events", "public_lead_intake"],
    verified_files: proofFiles.map((file) => ({ path: file, sha256: digest(file), bytes: fs.statSync(file).size })),
    truth_boundary: "Verification proves local runtime behavior, persistent public lead intake, sanitized public proof, control-room API wiring, security controls, signed webhook delivery, and tests. It does not prove a live provider credential, customer payment, or public deployment exists.",
  };
  fs.writeFileSync(path.join(proofDirectory, "verification.json"), `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, event: "company_runtime.verified", proof: path.join(proofDirectory, "verification.json") })}\n`);
}

try { main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, event: "company_runtime.verification_failed", error: error.stack || error.message })}\n`);
  process.exit(1);
}
