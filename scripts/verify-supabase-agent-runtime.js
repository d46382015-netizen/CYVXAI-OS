#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const files = [
  "core/integrations/supabase-service-runtime.js",
  "core/integrations/supabase-agent-identity.js",
  "core/integrations/supabase-persistence-adapter.js",
  "scripts/bootstrap-cyvx-supabase.js",
  "scripts/run-supabase-production-canary.js",
  "test/supabase-agent-runtime.test.js"
];

function fail(error, details = {}) {
  process.stderr.write(`${JSON.stringify({ ok: false, error, ...details })}\n`);
  process.exit(1);
}

for (const relative of files) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) fail("MISSING_ARTIFACT", { file: relative });
  const content = fs.readFileSync(file, "utf8");
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(content) || /sbp_[A-Za-z0-9_-]{10,}/.test(content)) {
    fail("CREDENTIAL_COMMITTED", { file: relative });
  }
  if (relative.endsWith(".js")) {
    const checked = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
    if (checked.status !== 0) process.exit(checked.status || 1);
  }
}

const tests = spawnSync(process.execPath, ["--test", path.join(root, "test", "supabase-agent-runtime.test.js")], {
  cwd: root,
  stdio: "inherit"
});
if (tests.status !== 0) process.exit(tests.status || 1);

process.stdout.write(`${JSON.stringify({
  ok: true,
  capability: "supabase-agent-runtime",
  files: files.length,
  owner_bootstrap: true,
  agent_identity_issuer: true,
  rls_scoped_persistence: true,
  service_only_governance_writes: true,
  controlled_canary: true
})}\n`);
