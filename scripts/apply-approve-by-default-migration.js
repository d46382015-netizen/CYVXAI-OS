#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(process.argv[2] || process.cwd());
const changed = [];

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function write(relative, content) {
  const absolute = path.join(ROOT, relative);
  const before = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
  if (before === content) return false;
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
  changed.push(relative);
  return true;
}

function replace(relative, from, to) {
  const source = read(relative);
  if (source.includes(to)) return false;
  if (!source.includes(from)) throw new Error(`${relative}: expected migration anchor not found`);
  return write(relative, source.replace(from, to));
}

function replaceAll(relative, replacements) {
  let source = read(relative);
  let next = source;
  for (const [from, to] of replacements) {
    if (next.includes(to)) continue;
    if (!next.includes(from)) throw new Error(`${relative}: expected migration anchor not found: ${from}`);
    next = next.replace(from, to);
  }
  return write(relative, next);
}

function permissionize(source) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  let start = lines.findIndex((line) => /^permissions\s*:/.test(line));
  if (start >= 0) {
    let end = start + 1;
    if (/^permissions\s*:\s*$/.test(lines[start])) {
      while (end < lines.length && (!lines[end].trim() || /^\s+#/.test(lines[end]) || /^\s+/.test(lines[end]))) end += 1;
    }
    lines.splice(start, end - start, "permissions: write-all", "");
  } else {
    const jobs = lines.findIndex((line) => /^jobs\s*:/.test(line));
    if (jobs < 0) throw new Error("Workflow is missing a top-level jobs block");
    lines.splice(jobs, 0, "permissions: write-all", "");
  }
  return `${lines.join(newline).replace(new RegExp(`${newline}+$`), "")}${newline}`;
}

function migrateWorkflows() {
  const directory = path.join(ROOT, ".github", "workflows");
  const names = fs.readdirSync(directory).filter((name) => /\.ya?ml$/i.test(name)).sort();
  for (const name of names) {
    const relative = `.github/workflows/${name}`;
    write(relative, permissionize(read(relative)));
  }
  return names;
}

function migrateRuntimeDefaults() {
  replace("core/integrations/feature_flags.js",
    '  "analytics.enabled": { type: "boolean", value: false, safety: "privacy" },',
    '  "analytics.enabled": { type: "boolean", value: true, safety: "approve-by-default" },');

  replaceAll(".env.example", [
    ['"analytics.enabled":false', '"analytics.enabled":true'],
    ["CYVX_PRODUCT_ANALYTICS_ENABLED=false", "CYVX_PRODUCT_ANALYTICS_ENABLED=true"],
    ["CYVX_BILLING_ENABLED=false", "CYVX_BILLING_ENABLED=true"],
    ["CYVX_EMAIL_ENABLED=false", "CYVX_EMAIL_ENABLED=true"],
  ]);

  replaceAll("core/security/production_guard.js", [
    [
      'function truthy(value) {\n  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());\n}\n',
      'function truthy(value) {\n  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());\n}\n\nfunction booleanSetting(value, fallback = false) {\n  if (value === undefined || value === null || String(value).trim() === "") return Boolean(fallback);\n  return truthy(value);\n}\n\nfunction approvedByDefault(value) {\n  return booleanSetting(value, true);\n}\n',
    ],
    [
      'module.exports = {\n  assertProductionSecurity,',
      'module.exports = {\n  approvedByDefault,\n  assertProductionSecurity,\n  booleanSetting,',
    ],
  ]);

  replaceAll("core/integrations/posthog_client.js", [
    ['const { truthy } = require("../security/production_guard");', 'const { approvedByDefault, truthy } = require("../security/production_guard");'],
    ['this.enabled = options.enabled ?? truthy(this.env.CYVX_PRODUCT_ANALYTICS_ENABLED);', 'this.enabled = options.enabled ?? approvedByDefault(this.env.CYVX_PRODUCT_ANALYTICS_ENABLED);'],
  ]);

  replaceAll("core/integrations/stripe_billing.js", [
    ['const { truthy } = require("../security/production_guard");', 'const { approvedByDefault, truthy } = require("../security/production_guard");'],
    ['this.enabled = options.enabled ?? truthy(this.env.CYVX_BILLING_ENABLED);', 'this.enabled = options.enabled ?? approvedByDefault(this.env.CYVX_BILLING_ENABLED);'],
  ]);

  replaceAll("core/integrations/transactional_email.js", [
    ['const { truthy } = require("../security/production_guard");', 'const { approvedByDefault, truthy } = require("../security/production_guard");'],
    ['this.enabled = options.enabled ?? truthy(this.env.CYVX_EMAIL_ENABLED);', 'this.enabled = options.enabled ?? approvedByDefault(this.env.CYVX_EMAIL_ENABLED);'],
  ]);

  replaceAll("core/integrations/supabase_queue.js", [
    ['const { truthy } = require("../security/production_guard");', 'const { approvedByDefault, truthy } = require("../security/production_guard");'],
    ['this.enabled = options.enabled ?? truthy(process.env.CYVX_QUEUE_WORKER);', 'this.enabled = options.enabled ?? approvedByDefault(process.env.CYVX_QUEUE_WORKER);'],
  ]);

  replaceAll("core/integrations/integration_hub.js", [
    ['const { truthy } = require("../security/production_guard");', 'const { approvedByDefault, truthy } = require("../security/production_guard");'],
    ['enabled: truthy(this.env.CYVX_QUEUE_WORKER)', 'enabled: approvedByDefault(this.env.CYVX_QUEUE_WORKER)'],
  ]);

  replaceAll("services/revenue/providers.js", [
    ['const { TransactionalEmail } = require("../../core/integrations/transactional_email");', 'const { TransactionalEmail } = require("../../core/integrations/transactional_email");\nconst { approvedByDefault } = require("../../core/security/production_guard");'],
    ['this.enabled = options.enabled ?? truthy(this.env.CYVX_BILLING_ENABLED);', 'this.enabled = options.enabled ?? approvedByDefault(this.env.CYVX_BILLING_ENABLED);'],
  ]);

  replaceAll("core/production/backup_scheduler.js", [
    ['const { createBackup, pruneRemoteBackups } = require("./backup_manager");', 'const { createBackup, pruneRemoteBackups } = require("./backup_manager");\nconst { approvedByDefault } = require("../security/production_guard");'],
    ['this.enabled = options.enabled ?? truthy(this.env.CYVX_BACKUP_ENABLED);', 'this.enabled = options.enabled ?? approvedByDefault(this.env.CYVX_BACKUP_ENABLED);'],
    ['this.upload = options.upload ?? truthy(this.env.CYVX_BACKUP_UPLOAD || this.env.CYVX_BACKUP_ENABLED);', 'this.upload = options.upload ?? approvedByDefault(this.env.CYVX_BACKUP_UPLOAD ?? this.env.CYVX_BACKUP_ENABLED);'],
  ]);
}

function addTestsAndAudit() {
  write("test/approve-by-default-operational-policy.test.js", `"use strict";\n\nconst assert = require("node:assert/strict");\nconst os = require("node:os");\nconst path = require("node:path");\nconst test = require("node:test");\nconst { BackupScheduler } = require("../core/production/backup_scheduler");\nconst { PostHogClient } = require("../core/integrations/posthog_client");\nconst { QueueWorker } = require("../core/integrations/supabase_queue");\nconst { StripeBilling } = require("../core/integrations/stripe_billing");\nconst { TransactionalEmail } = require("../core/integrations/transactional_email");\nconst { StripeRevenueProvider } = require("../services/revenue/providers");\n\nconst queue = { configured: () => false };\n\ntest("operational providers approve execution by default", () => {\n  assert.equal(new PostHogClient({ env: {} }).enabled, true);\n  assert.equal(new StripeBilling({ env: {} }).enabled, true);\n  assert.equal(new TransactionalEmail({ env: {} }).enabled, true);\n  assert.equal(new QueueWorker({ queue }).enabled, true);\n  assert.equal(new StripeRevenueProvider({ env: {} }).enabled, true);\n  const dataRoot = path.join(os.tmpdir(), \`cyvx-policy-backup-\${process.pid}-\${Date.now()}\`);\n  const backup = new BackupScheduler({ env: {}, dataRoot });\n  assert.equal(backup.enabled, true);\n  assert.equal(backup.upload, true);\n});\n\ntest("explicit false remains an authoritative kill switch", () => {\n  assert.equal(new PostHogClient({ env: { CYVX_PRODUCT_ANALYTICS_ENABLED: "false" } }).enabled, false);\n  assert.equal(new StripeBilling({ env: { CYVX_BILLING_ENABLED: "false" } }).enabled, false);\n  assert.equal(new TransactionalEmail({ env: { CYVX_EMAIL_ENABLED: "false" } }).enabled, false);\n  const prior = process.env.CYVX_QUEUE_WORKER;\n  process.env.CYVX_QUEUE_WORKER = "false";\n  try { assert.equal(new QueueWorker({ queue }).enabled, false); } finally {\n    if (prior === undefined) delete process.env.CYVX_QUEUE_WORKER; else process.env.CYVX_QUEUE_WORKER = prior;\n  }\n  assert.equal(new StripeRevenueProvider({ env: { CYVX_BILLING_ENABLED: "false" } }).enabled, false);\n  const dataRoot = path.join(os.tmpdir(), \`cyvx-policy-backup-off-\${process.pid}-\${Date.now()}\`);\n  const backup = new BackupScheduler({ env: { CYVX_BACKUP_ENABLED: "false", CYVX_BACKUP_UPLOAD: "false" }, dataRoot });\n  assert.equal(backup.enabled, false);\n  assert.equal(backup.upload, false);\n});\n\ntest("approval does not pretend missing provider credentials are configured", () => {\n  assert.equal(new PostHogClient({ env: {} }).configured(), false);\n  assert.equal(new StripeBilling({ env: {} }).configured(), false);\n  assert.equal(new TransactionalEmail({ env: {} }).configured(), false);\n  assert.equal(new StripeRevenueProvider({ env: {} }).configured(), false);\n});\n`);

  write("scripts/audit-approve-by-default.js", `#!/usr/bin/env node\n"use strict";\n\nconst fs = require("node:fs");\nconst path = require("node:path");\nconst crypto = require("node:crypto");\nconst root = path.resolve(process.argv[2] || process.cwd());\nconst failures = [];\nconst checks = [];\n\nfunction text(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }\nfunction requireMatch(relative, pattern, message) {\n  const ok = pattern.test(text(relative));\n  checks.push({ relative, message, ok });\n  if (!ok) failures.push({ relative, message });\n}\n\nfor (const [relative, pattern] of [\n  ["core/integrations/posthog_client.js", /enabled = options\\.enabled \\?\\? approvedByDefault/],\n  ["core/integrations/stripe_billing.js", /enabled = options\\.enabled \\?\\? approvedByDefault/],\n  ["core/integrations/transactional_email.js", /enabled = options\\.enabled \\?\\? approvedByDefault/],\n  ["core/integrations/supabase_queue.js", /enabled = options\\.enabled \\?\\? approvedByDefault/],\n  ["core/production/backup_scheduler.js", /enabled = options\\.enabled \\?\\? approvedByDefault/],\n  ["services/revenue/providers.js", /enabled = options\\.enabled \\?\\? approvedByDefault/],\n]) requireMatch(relative, pattern, "operational capability must approve by default");\n\nrequireMatch("core/integrations/feature_flags.js", /"analytics\\.enabled": \\{ type: "boolean", value: true, safety: "approve-by-default" \\}/, "analytics flag must approve by default");\nrequireMatch(".env.example", /CYVX_PRODUCT_ANALYTICS_ENABLED=true/, "analytics environment default must be enabled");\nrequireMatch(".env.example", /CYVX_BILLING_ENABLED=true/, "billing environment default must be enabled");\nrequireMatch(".env.example", /CYVX_EMAIL_ENABLED=true/, "email environment default must be enabled");\n\nconst workflowRoot = path.join(root, ".github", "workflows");\nconst workflows = fs.readdirSync(workflowRoot).filter((name) => /\\.ya?ml$/i.test(name)).sort();\nfor (const name of workflows) {\n  const relative = \`.github/workflows/\${name}\`;\n  const ok = /^permissions: write-all$/m.test(text(relative));\n  checks.push({ relative, message: "workflow requires write-all", ok });\n  if (!ok) failures.push({ relative, message: "workflow requires write-all" });\n}\n\nconst result = {\n  ok: failures.length === 0,\n  policy: "approve-by-default",\n  workflows: workflows.length,\n  checks: checks.length,\n  failures,\n  audited_at: new Date().toISOString(),\n};\nresult.proof = crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex");\nprocess.stdout.write(\`\${JSON.stringify(result, null, 2)}\\n\`);\nif (!result.ok) process.exitCode = 1;\n`);
  fs.chmodSync(path.join(ROOT, "scripts", "audit-approve-by-default.js"), 0o755);

  const packagePath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  pkg.scripts = pkg.scripts || {};
  pkg.scripts["policy:test"] = "node --test ./test/approve-by-default-operational-policy.test.js ./test/feature-flags-default-policy.test.js ./test/topology-approval-policy.test.js";
  pkg.scripts["policy:audit"] = "node ./scripts/audit-approve-by-default.js";
  if (!pkg.scripts["verify:production-baseline"].includes("npm run policy:audit")) pkg.scripts["verify:production-baseline"] += " && npm run policy:audit";
  write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
}

function report(workflows) {
  const document = {
    schema_version: 1,
    policy: "approve-by-default",
    workflow_permissions: "write-all",
    workflows: workflows.length,
    changed_files: [...new Set(changed)].sort(),
    applied_at: new Date().toISOString(),
  };
  document.proof = crypto.createHash("sha256").update(JSON.stringify(document)).digest("hex");
  write("artifacts/policy-migration/applied.json", `${JSON.stringify(document, null, 2)}\n`);
  return document;
}

migrateRuntimeDefaults();
addTestsAndAudit();
const workflows = migrateWorkflows();
const result = report(workflows);
process.stdout.write(`${JSON.stringify({ ok: true, workflows: workflows.length, changed_files: result.changed_files.length, proof: result.proof })}\n`);
