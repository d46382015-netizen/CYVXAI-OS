"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { SupabaseRuntime } = require("../core/integrations/supabase-runtime");

const root = path.resolve(__dirname, "..");
const required = [
  "config/public-runtime.json",
  "core/integrations/supabase-public-config.js",
  "core/integrations/supabase-runtime.js",
  "api/governance-public.js",
  "test/supabase-public-config.test.js"
];

for (const relative of required) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: "MISSING_ARTIFACT", file: relative })}\n`);
    process.exit(1);
  }
}

for (const relative of [
  "core/integrations/supabase-public-config.js",
  "core/integrations/supabase-runtime.js",
  "api/governance-public.js"
]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, relative)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

const tests = spawnSync(process.execPath, ["--test", path.join(root, "test/supabase-public-config.test.js")], { stdio: "inherit" });
if (tests.status !== 0) process.exit(tests.status || 1);

async function main() {
  const runtime = new SupabaseRuntime({ repoRoot: root });
  const status = runtime.status();
  if (!status.ready) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: "SUPABASE_NOT_READY", status })}\n`);
    process.exit(1);
  }

  let live_probe = { skipped: true };
  if (process.env.CYVX_VERIFY_LIVE_SUPABASE === "true") {
    live_probe = await runtime.probe(Number(process.env.CYVX_SUPABASE_PROBE_TIMEOUT_MS || 10000));
    if (!live_probe.ok) {
      process.stderr.write(`${JSON.stringify({ ok: false, error: "SUPABASE_LIVE_PROBE_FAILED", live_probe })}\n`);
      process.exit(1);
    }
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    capability: "supabase-runtime",
    provider: status.provider,
    project_url: status.project_url,
    publishable_key_fingerprint: status.publishable_key_fingerprint,
    packages: ["@supabase/supabase-js", "@supabase/ssr"],
    session_refresh: true,
    live_probe
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.code || "VERIFY_FAILED", message: error.message })}\n`);
  process.exit(1);
});
