#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { inspectProductionSecurity } = require("../core/security/production_guard");

const ROOT = path.join(__dirname, "..");
const REQUIRED = [
  ".github/workflows/ci.yml",
  ".github/workflows/uptime.yml",
  ".github/workflows/backup-drill.yml",
  ".github/workflows/security.yml",
  ".github/workflows/database-migrate.yml",
  ".github/workflows/release-production-baseline.yml",
  "core/security/production_guard.js",
  "api/secure-production.js",
  "core/observability/telemetry.js",
  "core/production/backup_manager.js",
  "core/production/backup_scheduler.js",
  "core/storage/managed_data_plane.js",
  "ops/postgres/001_production_baseline.sql",
  "ops/prometheus/alerts.yml",
  "ops/otel/collector.yaml",
  "status/server.js",
  "docs/operations/PRODUCTION_BASELINE.md",
  "docs/operations/INCIDENT_RESPONSE.md",
  "docs/operations/SLO.md",
  "docs/operations/SUPPORT.md",
  "docs/operations/RELEASE_PROCESS.md",
  "render.yaml",
];

function verify() {
  const checks = [];
  for (const file of REQUIRED) checks.push(check(`file:${file}`, fs.existsSync(path.join(ROOT, file)), "required production-baseline artifact"));
  const ci = read(".github/workflows/ci.yml");
  checks.push(check("ci:pid_capture", ci.includes("API_PID=$!"), "legacy API PID must be captured correctly"));
  checks.push(check("ci:no_malformed_pid", !ci.includes("API_PID!="), "malformed API_PID assignment must be absent"));
  checks.push(check("ci:baseline_gate", ci.includes("npm run verify:production-baseline"), "CI must execute the production baseline gate"));
  const runtime = read("api/runtime-v7.js");
  const packageJson = JSON.parse(read("package.json") || "{}");
  checks.push(check("security:api_entrypoint", packageJson.scripts && packageJson.scripts.api === "node ./api/secure-production.js", "direct production gateway command must use the fail-closed wrapper"));
  checks.push(check("security:runtime_guard", runtime.includes("assertProductionSecurity"), "production runtime must validate security before startup"));
  checks.push(check("backup:scheduler", runtime.includes("BackupScheduler"), "runtime must schedule encrypted backups"));
  checks.push(check("data:managed_postgres", runtime.includes("ManagedDataPlane"), "runtime must connect the managed PostgreSQL data plane"));
  checks.push(check("observability:telemetry", runtime.includes("Telemetry"), "runtime must initialize structured telemetry"));
  const metrics = read("core/ops/metrics.js");
  for (const name of ["cyvx_errors_total", "cyvx_backup_last_success_timestamp_seconds", "cyvx_managed_data_healthy"]) {
    checks.push(check(`metrics:${name}`, metrics.includes(name), `${name} must be exported`));
  }
  const migration = read("ops/postgres/001_production_baseline.sql");
  for (const table of ["cyvx_runtime_snapshots", "cyvx_incidents", "cyvx_backup_manifests", "cyvx_audit_events"]) {
    checks.push(check(`postgres:${table}`, migration.includes(table), `${table} must exist in the managed PostgreSQL schema`));
  }
  const simulatedProduction = inspectProductionSecurity({ NODE_ENV: "production" });
  checks.push(check("security:fail_closed", !simulatedProduction.ok && simulatedProduction.failed.includes("CYVX_API_KEY"), "production configuration without secrets must fail closed"));
  const failed = checks.filter((item) => !item.ok);
  const result = { ok: failed.length === 0, timestamp: new Date().toISOString(), checks, failed: failed.map((item) => item.key) };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

function read(file) {
  try { return fs.readFileSync(path.join(ROOT, file), "utf8"); }
  catch { return ""; }
}

function check(key, ok, guidance) { return { key, ok: Boolean(ok), guidance }; }

if (require.main === module) verify();

module.exports = { verify };
