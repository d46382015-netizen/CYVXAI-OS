#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { APP_VERSION, SCHEMA_VERSION, now } = require("../runtime/missions/base");

const repoRoot = path.resolve(__dirname, "..");
const artifactsRoot = path.join(repoRoot, "artifacts");
const logsRoot = path.join(artifactsRoot, "verification-logs");
const reportPath = path.join(artifactsRoot, "verification-report.json");
const statusPath = path.join(repoRoot, "docs", "PRODUCTION_STATUS.md");
fs.mkdirSync(logsRoot, { recursive: true });
fs.mkdirSync(path.dirname(statusPath), { recursive: true });

const verificationEnvironment = {
  ...process.env,
  NODE_ENV: "test",
  CYVX_ENV: "test",
  CYVX_ALLOW_INSECURE_LOCAL: "true",
  CYVX_AUTH_SECRET: process.env.CYVX_AUTH_SECRET || "verification-secret-longer-than-thirty-two-characters",
};

const specifications = [
  { name: "runtime_doctor", command: "bash", args: ["scripts/doctor.sh"], category: "static" },
  { name: "shell_syntax", command: "bash", args: ["-n", "run.sh", "scripts/doctor.sh", "scripts/backup.sh", "scripts/restore.sh", "scripts/evidence-verify.sh", "scripts/test-integration.sh"], category: "static" },
  { name: "unit_and_regression_tests", command: "npm", args: ["test"], category: "unit" },
  { name: "real_http_integration", command: "bash", args: ["scripts/test-integration.sh"], category: "integration" },
  { name: "restart_recovery", command: process.execPath, args: ["--test", "test/mission-recovery.test.js"], category: "recovery" },
  { name: "backup_restore", command: process.execPath, args: ["--test", "test/mission-backup-restore.test.js"], category: "backup" },
];

function shellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`;
}

function parseTap(output) {
  const total = [...output.matchAll(/^# tests (\d+)$/gm)].reduce((sum, match) => sum + Number(match[1]), 0);
  const passed = [...output.matchAll(/^# pass (\d+)$/gm)].reduce((sum, match) => sum + Number(match[1]), 0);
  const failed = [...output.matchAll(/^# fail (\d+)$/gm)].reduce((sum, match) => sum + Number(match[1]), 0);
  const skipped = [...output.matchAll(/^# skipped (\d+)$/gm)].reduce((sum, match) => sum + Number(match[1]), 0);
  const skipReasons = [...output.matchAll(/^ok \d+ - (.+?) # SKIP(?: (.*))?$/gm)].map((match) => ({ test: match[1], reason: match[2] || "No reason supplied" }));
  return { total, passed, failed, skipped, skip_reasons: skipReasons };
}

function execute(specification, index) {
  const started = Date.now();
  const result = spawnSync(specification.command, specification.args, {
    cwd: repoRoot,
    env: verificationEnvironment,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const output = `${stdout}${stderr}`;
  const filename = `${String(index + 1).padStart(2, "0")}-${specification.name}.log`;
  const relativeLog = path.join("artifacts", "verification-logs", filename).replace(/\\/g, "/");
  fs.writeFileSync(path.join(logsRoot, filename), output);
  process.stdout.write(`\n=== ${specification.name} ===\n${output}`);
  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  return {
    name: specification.name,
    category: specification.category,
    command: [specification.command, ...specification.args].map(shellQuote).join(" "),
    status: exitCode === 0 ? "passed" : "failed",
    exit_code: exitCode,
    signal: result.signal || null,
    duration_ms: Date.now() - started,
    log: relativeLog,
    tests: parseTap(output),
  };
}

function git(...args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

const commands = specifications.map(execute);
const aggregate = commands.reduce((totals, command) => {
  totals.total += command.tests.total;
  totals.passed += command.tests.passed;
  totals.failed += command.tests.failed;
  totals.skipped += command.tests.skipped;
  totals.skip_reasons.push(...command.tests.skip_reasons.map((item) => ({ ...item, command: command.name })));
  return totals;
}, { total: 0, passed: 0, failed: 0, skipped: 0, skip_reasons: [] });

const failedCommands = commands.filter((command) => command.status === "failed");
const allPassed = failedCommands.length === 0 && aggregate.failed === 0;
const category = (name) => commands.filter((command) => command.category === name).every((command) => command.status === "passed");
const capability = (verified, evidence) => ({ status: verified ? "VERIFIED" : "BLOCKED", evidence });

const report = {
  generated_at: now(),
  git_commit: git("rev-parse", "HEAD"),
  git_branch: git("rev-parse", "--abbrev-ref", "HEAD"),
  git_dirty: Boolean(git("status", "--porcelain")),
  application_version: APP_VERSION,
  schema_version: SCHEMA_VERSION,
  production_gate: allPassed ? "VERIFIED" : "BLOCKED",
  commands_executed: commands,
  tests: {
    total: aggregate.total,
    passed: aggregate.passed,
    failed: aggregate.failed,
    skipped: aggregate.skipped,
    skipped_with_reasons: aggregate.skip_reasons,
  },
  runtime_health: capability(category("integration"), "Real public and mission HTTP servers, database readiness, and worker heartbeat tests"),
  worker_health: capability(category("integration") && category("recovery"), "Durable claim, lease, heartbeat, completion, shutdown, and recovery tests"),
  evidence_verification_result: capability(category("integration"), "Artifact, record, chain-link, chain-hash, ordering, and duplicate-sequence tamper tests"),
  recovery_result: capability(category("recovery"), "Worker interruption after claim, lease expiration, replacement worker, and duplicate-effect assertions"),
  backup_restore_result: capability(category("backup"), "Checksummed backup, clean restore, HTTP retrieval, evidence verification, and post-restore execution"),
  known_limitations: [
    { capability: "Complex mission branching", status: "PARTIAL" },
    { capability: "Scheduled mission execution", status: "NOT_IMPLEMENTED" },
    { capability: "External model provider execution", status: "PARTIAL" },
    { capability: "Internationalization", status: "NOT_IMPLEMENTED" },
    { capability: "Advanced capability version migration", status: "NOT_IMPLEMENTED" },
  ],
  failing_commands: failedCommands.map((command) => ({ command: command.command, exit_code: command.exit_code, log: command.log })),
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

function line(status, text) { return `- ${status} — ${text}`; }
const docs = `# CYVXAI-OS Production Status\n\n` +
  `Generated: ${report.generated_at}\n\n` +
  `Git commit: \`${report.git_commit}\`\n\n` +
  `Application version: \`${APP_VERSION}\`\n\n` +
  `Schema version: \`${SCHEMA_VERSION}\`\n\n` +
  `Production Gate: **${report.production_gate}**\n\n` +
  `## Core Runtime\n\n` +
  `${line(report.runtime_health.status, "Public Gateway → Authentication → Authorization → Mission API → SQLite transaction")}\n` +
  `${line(report.worker_health.status, "Persistent Job → Worker Execution → Event → Evidence → Outcome → Learning → UI Update")}\n` +
  `${line(report.recovery_result.status, "Expired-lease recovery and duplicate-completion prevention")}\n` +
  `${line(report.evidence_verification_result.status, "Tamper-evident evidence creation and active verification")}\n` +
  `${line(report.backup_restore_result.status, "Checksummed backup, restore, and post-restore execution")}\n` +
  `${line(category("integration") ? "VERIFIED" : "BLOCKED", "Organization isolation and role enforcement over real HTTP")}\n` +
  `${line(category("integration") ? "VERIFIED" : "BLOCKED", "Mobile operator UI uses live mission endpoints and runtime state")}\n\n` +
  `## Verification Totals\n\n` +
  `- Tests executed: ${aggregate.total}\n` +
  `- Tests passed: ${aggregate.passed}\n` +
  `- Tests failed: ${aggregate.failed}\n` +
  `- Tests skipped: ${aggregate.skipped}\n` +
  `- Commands failed: ${failedCommands.length}\n\n` +
  `## Secondary Capabilities\n\n` +
  report.known_limitations.map((item) => line(item.status, item.capability)).join("\n") + "\n\n" +
  `## Unresolved Verification Failures\n\n` +
  (failedCommands.length
    ? failedCommands.map((command) => line("BLOCKED", `\`${command.command}\` exited ${command.exit_code}; see \`${command.log}\``)).join("\n")
    : line("VERIFIED", "No unresolved verification failures")) + "\n";
fs.writeFileSync(statusPath, docs);

process.stdout.write(`\nVerification report: ${path.relative(repoRoot, reportPath)}\n`);
process.stdout.write(`Production status: ${path.relative(repoRoot, statusPath)}\n`);
process.stdout.write(`Tests: ${aggregate.passed} passed, ${aggregate.failed} failed, ${aggregate.skipped} skipped (${aggregate.total} executed)\n`);
if (!allPassed) process.exit(1);
