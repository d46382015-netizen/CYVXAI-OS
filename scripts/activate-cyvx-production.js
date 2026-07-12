#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { SupabaseRuntime } = require("../core/integrations/supabase-runtime");
const { runCanary } = require("./run-supabase-production-canary");
const { runFirstGovernedVenture } = require("./run-first-governed-venture");

const root = path.resolve(__dirname, "..");
const PROJECT_REF = "yokpfcbdvszdavohibkh";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
    error.code = "ACTIVATION_COMMAND_FAILED";
    error.status = result.status;
    if (options.capture) error.details = String(result.stderr || result.stdout || "").slice(-4000);
    throw error;
  }
  return result;
}

function requireEnvironment(env, names) {
  const missing = names.filter((name) => !String(env[name] || "").trim());
  if (missing.length) {
    const error = new Error(`Missing required production environment values: ${missing.join(", ")}`);
    error.code = "ACTIVATION_ENVIRONMENT_INCOMPLETE";
    error.missing = missing;
    throw error;
  }
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = /token|password|secret|authorization|credential/i.test(key) ? "[redacted]" : redact(item);
  }
  return output;
}

function writeEvidence(report, env = process.env) {
  const directory = path.resolve(env.CYVX_ACTIVATION_EVIDENCE_DIR || path.join(root, ".cyvx", "evidence"));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, "production-activation-latest.json");
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(redact(report), null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  fs.chmodSync(target, 0o600);
  return target;
}

async function applySchema(env) {
  requireEnvironment(env, ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"]);
  run("npx", ["--yes", "supabase@latest", "link", "--project-ref", PROJECT_REF], { env });
  run("npx", ["--yes", "supabase@latest", "migration", "list", "--linked"], { env });
  run("npx", ["--yes", "supabase@latest", "db", "push", "--include-all", "--yes"], { env });
}

async function activate(options = {}) {
  const env = options.env || process.env;
  const startedAt = new Date().toISOString();
  const applyMigrations = options.applyMigrations ?? env.CYVX_ACTIVATION_APPLY_SCHEMA === "true";
  requireEnvironment(env, ["SUPABASE_SECRET_KEY", "CYVX_OWNER_EMAIL", "CYVX_OWNER_PASSWORD"]);

  run(process.execPath, ["./scripts/verify-supabase-schema.js"], { env });
  run(process.execPath, ["./scripts/verify-supabase-agent-runtime.js"], { env });
  if (applyMigrations) await applySchema(env);

  const runtime = options.runtime || new SupabaseRuntime({ repoRoot: root, env, schemaCacheMs: 0 });
  const schema = await runtime.assertCloudWritesReady({ force: true, timeoutMs: 15000 });
  const canary = options.runCanary ? await options.runCanary({ env }) : await runCanary({ env });
  const venture = options.runVenture ? await options.runVenture({ env }) : await runFirstGovernedVenture({ env });

  const completedAt = new Date().toISOString();
  const report = {
    ok: true,
    activation: "cyvx-production",
    project_ref: PROJECT_REF,
    started_at: startedAt,
    completed_at: completedAt,
    schema: {
      ready: schema.ready,
      applied_version: schema.applied_version,
      expected_version: schema.expected_version || 202607120004
    },
    canary: {
      ok: canary.ok,
      run_id: canary.run_id,
      mission_id: canary.mission_id,
      deployment: canary.deployment,
      isolation: canary.isolation
    },
    first_venture: venture,
    operating_state: venture.production_gate && venture.production_gate.eligible
      ? "ready_for_governed_production_review"
      : "staging_validation_active",
    safeguards: {
      cloud_writes_fail_closed: true,
      two_key_governance: true,
      grant_bound_child_creation: true,
      grant_bound_deployment: true,
      production_not_auto_authorized: true,
      spend_not_connected: true
    }
  };
  report.evidence_file = writeEvidence(report, env);
  return report;
}

async function main() {
  const report = await activate();
  process.stdout.write(`${JSON.stringify(redact(report))}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: error.code || "PRODUCTION_ACTIVATION_FAILED",
      message: error.message,
      missing: error.missing || undefined,
      details: error.details || undefined
    })}\n`);
    process.exit(1);
  });
}

module.exports = {
  PROJECT_REF,
  activate,
  applySchema,
  requireEnvironment,
  redact,
  writeEvidence,
  run
};
