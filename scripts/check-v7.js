"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const NODE_FILES = [
  "api/runtime-v7.js",
  "api/runtime-cinematic.js",
  "api/public.js",
  "api/public-experience.js",
  "api/secure-production.js",
  "api/integrated-production.js",
  "api/integration_routes.js",
  "core/production/autonomy_supervisor.js",
  "core/ops/readiness.js",
  "core/ops/next_actions.js",
  "core/ops/runtime_snapshot.js",
  "core/ops/overview.js",
  "core/ops/metrics.js",
  "core/ops/http_server.js",
  "core/security/production_guard.js",
  "core/security/identity_gateway.js",
  "core/security/authorization_policy.js",
  "core/security/edge_guard.js",
  "core/security/workload_identity.js",
  "core/integrations/integration_hub.js",
  "core/integrations/supabase_data_client.js",
  "core/integrations/supabase_queue.js",
  "core/integrations/feature_flags.js",
  "core/integrations/stripe_billing.js",
  "core/integrations/transactional_email.js",
  "core/integrations/posthog_client.js",
  "core/integrations/sentry_transport.js",
  "core/observability/ai_trace.js",
  "scripts/verify-integrations-v8.js",
  "scripts/provision-cloudflare-v8.js",
  "scripts/oidc-smoke-v8.js",
];
const BROWSER_FILES = [
  "ui/experience.js",
  "ui/control.js",
  "ui/control-core.js",
  "ui/control-mission-read.js",
  "ui/control-mission-execute.js",
  "ui/control-bootstrap.js",
  "spark/ui/app.js",
  "spark/ui/spark-client.js",
  "spark/ui/spark-render.js",
  "spark/ui/spark-sync.js",
  "spark/ui/spark-create-actions.js",
  "spark/ui/spark-control-actions.js",
];

for (const file of NODE_FILES) check(file, path.join(ROOT, file));

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-v8-"));
try {
  for (const file of BROWSER_FILES) {
    const moduleFile = path.join(temporary, `${file.replace(/[\\/]/g, "-").replace(/\.js$/, "")}.mjs`);
    fs.copyFileSync(path.join(ROOT, file), moduleFile);
    check(file, moduleFile);
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log("CYVX v8 source validation passed");

function check(label, file) {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(`Validation failed: ${label}\n`);
    process.stderr.write(result.stderr || result.stdout || "unknown syntax error\n");
    process.exit(result.status || 1);
  }
}
