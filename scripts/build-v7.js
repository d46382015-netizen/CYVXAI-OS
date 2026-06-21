"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const NODE_FILES = [
  "api/runtime-v7.js",
  "core/production/autonomy_supervisor.js",
  "core/ops/readiness.js",
  "core/ops/next_actions.js",
  "core/ops/runtime_snapshot.js",
  "core/ops/overview.js",
  "core/ops/metrics.js",
  "core/ops/http_server.js",
  "test/runtime-supervisor.test.js",
  "test/ops-overview.test.js",
  "test/ui-contract.test.js",
];
const BROWSER_MODULES = [
  "spark/ui/spark-client.js",
  "spark/ui/spark-render.js",
  "spark/ui/spark-sync.js",
  "spark/ui/spark-create-actions.js",
  "spark/ui/spark-control-actions.js",
];

function main() {
  run(process.execPath, [path.join(ROOT, "scripts", "build.js")]);
  for (const file of NODE_FILES) run(process.execPath, ["--check", path.join(ROOT, file)]);
  for (const file of BROWSER_MODULES) {
    run(process.execPath, ["--input-type=module", "--check"], fs.readFileSync(path.join(ROOT, file), "utf8"));
  }
  copyBrowserModules();
  writeManifest();
  console.log(`CYVX v7 build complete: ${DIST}`);
}

function run(command, args, input) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", input });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "build validation failed\n");
    process.exit(result.status || 1);
  }
}

function copyBrowserModules() {
  const target = path.join(DIST, "spark", "ui");
  fs.mkdirSync(target, { recursive: true });
  for (const file of BROWSER_MODULES) fs.copyFileSync(path.join(ROOT, file), path.join(target, path.basename(file)));
}

function writeManifest() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const manifest = {
    name: pkg.name,
    version: pkg.version,
    built_at: new Date().toISOString(),
    production_entrypoint: "api/runtime-v7.js",
    control_plane: {
      bind: "127.0.0.1",
      port_offset: 4,
      routes: ["/healthz", "/readyz", "/api/control-plane", "/api/overview", "/metrics"],
    },
    capabilities: [
      "durable-worlds", "bounded-approvals", "approved-execution", "proof-stream",
      "lead-capture", "outcome-learning", "runtime-readiness", "next-action-intelligence",
    ],
  };
  fs.writeFileSync(path.join(DIST, "v7-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

main();
