#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(process.argv[2] || process.cwd());
const failures = [];
const checks = [];

function text(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function requireMatch(relative, pattern, message) {
  const ok = pattern.test(text(relative));
  checks.push({ relative, message, ok });
  if (!ok) failures.push({ relative, message });
}

for (const [relative, pattern] of [
  ["core/integrations/posthog_client.js", /enabled = options\.enabled \?\? approvedByDefault/],
  ["core/integrations/stripe_billing.js", /enabled = options\.enabled \?\? approvedByDefault/],
  ["core/integrations/transactional_email.js", /enabled = options\.enabled \?\? approvedByDefault/],
  ["core/integrations/supabase_queue.js", /enabled = options\.enabled \?\? approvedByDefault/],
  ["core/production/backup_scheduler.js", /enabled = options\.enabled \?\? approvedByDefault/],
  ["services/revenue/providers.js", /enabled = options\.enabled \?\? approvedByDefault/],
]) requireMatch(relative, pattern, "operational capability must approve by default");

requireMatch("core/integrations/feature_flags.js", /"analytics\.enabled": \{ type: "boolean", value: true, safety: "approve-by-default" \}/, "analytics flag must approve by default");
requireMatch(".env.example", /CYVX_PRODUCT_ANALYTICS_ENABLED=true/, "analytics environment default must be enabled");
requireMatch(".env.example", /CYVX_BILLING_ENABLED=true/, "billing environment default must be enabled");
requireMatch(".env.example", /CYVX_EMAIL_ENABLED=true/, "email environment default must be enabled");

const workflowRoot = path.join(root, ".github", "workflows");
const workflows = fs.readdirSync(workflowRoot).filter((name) => /\.ya?ml$/i.test(name)).sort();
for (const name of workflows) {
  const relative = `.github/workflows/${name}`;
  const ok = /^permissions: write-all$/m.test(text(relative));
  checks.push({ relative, message: "workflow requires write-all", ok });
  if (!ok) failures.push({ relative, message: "workflow requires write-all" });
}

const result = {
  ok: failures.length === 0,
  policy: "approve-by-default",
  workflows: workflows.length,
  checks: checks.length,
  failures,
  audited_at: new Date().toISOString(),
};
result.proof = crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex");
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
